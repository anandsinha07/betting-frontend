import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function Home() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [owner, setOwner] = useState(null);
  const [amount, setAmount] = useState("");
  const [userBalance, setUserBalance] = useState("0");
  const [selectedTeam, setSelectedTeam] = useState("");

  const [winningOutcome, setWinningOutcome] = useState("");
  const [winners, setWinners] = useState("");
  const [amounts, setAmounts] = useState("");

  const [resolveOutcome, setResolveOutcome] = useState("");

  const [withdrawableAmount, setWithdrawableAmount] = useState("0");

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        setAccount(accounts[0] || null);
      });
    }
  }, []);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();
        setAccount(userAddress);

        const contractAddress = "0x34f13cf42fAC7C609D691679f0d2454fe45b348f";//deployed on sepolia base testnet
        const contractABI = [
          "function deposit() external payable",
          "function finalizePayout(string outcome, address[] winners, uint256[] amounts) external",
          "function balances(address) external view returns (uint256)",
          "function balancesFinalized(address) external view returns (uint256)",
          "function owner() external view returns (address)",
          "function withdraw() external"
        ];

        const contractInstance = new ethers.Contract(contractAddress, contractABI, signer);
        setContract(contractInstance);

        const contractOwner = await contractInstance.owner();
        setOwner(contractOwner);

        fetchUserBalance(contractInstance, userAddress);
        fetchWithdrawableAmount(contractInstance, userAddress);
      } catch (error) {
        showAlert("Error connecting wallet: " + error.message, "error");
      }
    } else {
      showAlert("MetaMask not found", "error");
    }
  };

  const resolveGameOutcome = async () => {
    if (!resolveOutcome) return showAlert("Select a winning outcome", "error");
    if (account !== owner) return showAlert("Only the owner can resolve the outcome", "error");

    try {
      const response = await fetch("https://betting-backend-one.vercel.app/api/resolveOutcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: resolveOutcome }),
      });

      const data = await response.json();
      if (response.ok) {
        showAlert("Outcome resolved successfully!", "success");
      } else {
        showAlert(`Failed to resolve outcome: ${data.message}`, "error");
      }
    } catch (error) {
      console.error("Error resolving outcome:", error);
      showAlert("An error occurred. Check console for details.", "error");
    }
  };


  const fetchUserBalance = async (contract, userAddress) => {
    try {
      console.log("contract address", contract)
      const balance = await contract.balances(userAddress);
      setUserBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error("Error fetching balance:", error);
      showAlert("Failed to fetch user balance", "error");
    }
  };

  // Fetch Withdrawable Balance from Contract
  const fetchWithdrawableAmount = async (contract, userAddress) => {
    // if (!contract || !account) return;
    try {
      const amount = await contract.balancesFinalized(userAddress); // Fetch amount in WEI
      console.log("balancesFinalized amount", amount);
      setWithdrawableAmount(ethers.formatEther(amount)); // Convert to ETH
      console.log("withdrawableAmount amount", amount);
    } catch (error) {
      console.error("Error fetching withdrawable amount:", error);
      showAlert("Failed to fetch withdrawable amount", "error");
    }
  };

  // Call Withdraw Function on Smart Contract
  const withdraw = async () => {
    if (!contract) return showAlert("Contract not loaded", "error");
    if (withdrawableAmount === "0") return showAlert("No funds to withdraw", "error");

    try {
      const tx = await contract.withdraw();
      await tx.wait();
      showAlert("Withdrawal successful!", "success");

      // Reset the withdrawable amount to 0 after withdrawal
      setWithdrawableAmount("0");
    } catch (error) {
      handleContractError(error);
    }
  };


  const placeBet = async () => {
    if (!account) return showAlert("Please connect your wallet", "error");
    if (!contract) return showAlert("Contract not loaded", "error");
    if (!amount || isNaN(amount) || amount <= 0) return showAlert("Enter a valid bet amount", "error");
    if (!selectedTeam) return showAlert("Select a team", "error");

    try {
      const betAmount = ethers.parseEther(amount.toString());

      // Check user balance in the smart contract
      const userBalanceInContract = await contract.balances(account);
      console.log("userBalanceInContract", BigInt(userBalanceInContract));
      console.log("betAmount", BigInt(betAmount));
      if (BigInt(betAmount) > BigInt(userBalanceInContract)) {
        return showAlert("Insufficient balance in contract. Please deposit first.", "error");
      }

      // If balance is sufficient, call the backend API to place the bet
      const response = await fetch("https://betting-backend-one.vercel.app/api/placeBet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: account,
          amount: betAmount.toString(), // Send amount in wei
          outcome: selectedTeam
        }),
      });

      const data = await response.json();
      if (response.ok) {
        showAlert("Bet placed successfully!", "success");
      } else {
        showAlert(`Failed to place bet: ${data.message}`, "error");
      }
    } catch (error) {
      console.error("Error placing bet:", error);
      showAlert("An error occurred. Check console for details.", "error");
    }
  };

  const depositFunds = async () => {
    if (!contract || !amount) return showAlert("Enter a valid deposit amount", "error");

    try {
      const tx = await contract.deposit({ value: ethers.parseEther(amount) });
      await tx.wait();
      showAlert("Deposit successful!", "success");
    } catch (error) {
      handleContractError(error);
    }
  };

  // Fetch Payout Data from Backend API
  const fetchPayoutData = async () => {
    try {
      const response = await fetch("https://betting-backend-one.vercel.app/api/getPayoutData");
      const data = await response.json();

      if (!data || !data.outcome || !data.winners || !data.amounts) {
        showAlert("Invalid data received", "error");
        return;
      }

      setWinningOutcome(data.outcome.outcome); // "Team A"
      setWinners(data.winners.join(", ")); // Comma-separated winners
      setAmounts(data.amounts.map(amt => ethers.formatEther(amt)).join(", ")); // Convert Wei to ETH
    } catch (error) {
      console.error("Error fetching payout data:", error);
      showAlert("Failed to fetch payout data", "error");
    }
  };

  // Contract Call to Finalize Payout
  const finalizePayout = async () => {
    if (!contract) return showAlert("Contract not loaded", "error");
    if (!winningOutcome) return showAlert("Enter winning outcome", "error");
    if (!winners) return showAlert("Enter winners' addresses", "error");
    if (!amounts) return showAlert("Enter amounts", "error");

    try {
      const winnersArray = winners.split(",").map(addr => addr.trim());
      const amountsArray = amounts.split(",").map(amt => ethers.parseEther(amt.trim()));

      const tx = await contract.finalizePayout(winningOutcome, winnersArray, amountsArray);
      await tx.wait();
      showAlert("Payout finalized successfully!", "success");
    } catch (error) {
      handleContractError(error);
    }
  };



  const handleContractError = (error) => {
    if (error.code === "ACTION_REJECTED") {
      showAlert("Transaction was rejected by the user.", "error");
    } else if (error.reason) {
      showAlert(`Smart Contract Error: ${error.reason}`, "error");
    } else {
      console.error("Transaction failed:", error);
      showAlert("An error occurred. Check console for details.", "error");
    }
  };

  const showAlert = (message, type) => {
    alert(`${type.toUpperCase()}: ${message}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl font-bold">Pari-Mutuel Betting Game</h1>
      {account ? (
        <p className="mt-4">Connected: {account}</p>
      ) : (
        <button onClick={connectWallet} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">
          Connect Wallet
        </button>
      )}

      {account && (
        <div className="mt-6">
          <input
            type="text"
            placeholder="Enter amount (ETH)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border p-2 rounded mr-2"
          />
          <button onClick={depositFunds} className="px-4 py-2 bg-green-500 text-white rounded">
            Deposit
          </button>
        </div>
      )}

      {account && (
        <div className="mt-6">
          <p>Your Balance in Contract: <b>{userBalance} ETH</b></p>
          <input
            type="text"
            placeholder="Enter bet amount (ETH)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border p-2 rounded mr-2"
          />

          <select
            className="border p-2 rounded mr-2"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="">Select Team</option>
            <option value="Team A">Team A</option>
            <option value="Team B">Team B</option>
          </select>

          <button onClick={placeBet} className="px-4 py-2 bg-green-500 text-white rounded">
            Place Bet
          </button>
        </div>
      )}

      {account && account === owner && (
        <div className="mt-8 p-4 bg-white shadow rounded w-1/2">
          <h2 className="text-xl font-semibold mb-2">Finalize Payout</h2>

          {/* Fetch Data Button */}
          <button onClick={fetchPayoutData} className="px-4 py-2 bg-blue-500 text-white rounded w-full mb-2">
            Fetch Payout Data
          </button>

          {/* Winning Outcome */}
          <input
            type="text"
            placeholder="Winning Outcome"
            value={winningOutcome}
            onChange={(e) => setWinningOutcome(e.target.value)}
            className="border p-2 rounded w-full mb-2"
          />

          {/* Winners' Addresses */}
          <input
            type="text"
            placeholder="Winners' Addresses (comma-separated)"
            value={winners}
            onChange={(e) => setWinners(e.target.value)}
            className="border p-2 rounded w-full mb-2"
          />

          {/* Payout Amounts */}
          <input
            type="text"
            placeholder="Amounts (comma-separated in ETH)"
            value={amounts}
            onChange={(e) => setAmounts(e.target.value)}
            className="border p-2 rounded w-full mb-2"
          />

          {/* Finalize Payout Button */}
          <button onClick={finalizePayout} className="px-4 py-2 bg-red-500 text-white rounded w-full">
            Finalize Payout
          </button>
        </div>
      )}

      {account && account === owner && (
        <div className="mt-8 p-4 bg-white shadow rounded w-1/2">
          <h2 className="text-xl font-semibold mb-2">Resolve Outcome</h2>
          <select
            className="border p-2 rounded w-full mb-2"
            value={resolveOutcome}
            onChange={(e) => setResolveOutcome(e.target.value)}
          >
            <option value="">Select Winning Team</option>
            <option value="Team A">Team A</option>
            <option value="Team B">Team B</option>
          </select>
          <button onClick={resolveGameOutcome} className="px-4 py-2 bg-yellow-500 text-white rounded w-full">
            Resolve Outcome
          </button>
        </div>
      )}

      {account && (
        <div className="mt-8 p-4 bg-white shadow rounded w-1/2">
          <h2 className="text-xl font-semibold mb-2">Withdraw Funds</h2>

          {/* Show withdrawable balance */}
          <p className="mb-2">Withdrawable Amount: {withdrawableAmount} ETH</p>

          {/* Withdraw Button - Disabled if no funds */}
          <button
            onClick={withdraw}
            disabled={withdrawableAmount === "0"}
            className={`px-4 py-2 rounded w-full ${withdrawableAmount === "0" ? "bg-gray-400 cursor-not-allowed" : "bg-green-500 text-white"
              }`}
          >
            Withdraw
          </button>
        </div>
      )

      }
    </div>
  );
}
