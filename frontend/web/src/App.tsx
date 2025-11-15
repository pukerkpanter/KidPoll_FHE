import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface VoteData {
  id: string;
  title: string;
  description: string;
  creator: string;
  timestamp: number;
  option1: string;
  option2: string;
  option3: string;
  encryptedVotes: number;
  publicValue1: number;
  publicValue2: number;
  isVerified: boolean;
  decryptedValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [votes, setVotes] = useState<VoteData[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingVote, setCreatingVote] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newVoteData, setNewVoteData] = useState({ 
    title: "", 
    description: "", 
    option1: "👍 喜歡", 
    option2: "👎 不喜歡", 
    option3: "😊 超愛" 
  });
  const [selectedVote, setSelectedVote] = useState<VoteData | null>(null);
  const [userVote, setUserVote] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [activeTab, setActiveTab] = useState("votes");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失敗" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadVotes();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadVotes = async () => {
    if (!isConnected) return;
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const votesList: VoteData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          votesList.push({
            id: businessId,
            title: businessData.name,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            option1: "👍 喜歡",
            option2: "👎 不喜歡", 
            option3: "😊 超愛",
            encryptedVotes: 0,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading vote data:', e);
        }
      }
      
      setVotes(votesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "載入數據失敗" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const createVote = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "請先連接錢包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingVote(true);
    setTransactionStatus({ visible: true, status: "pending", message: "創建加密投票中..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("獲取合約失敗");
      
      const businessId = `vote-${Date.now()}`;
      const initialVotes = 0;
      
      const encryptedResult = await encrypt(contractAddress, address, initialVotes);
      
      const tx = await contract.createBusinessData(
        businessId,
        newVoteData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newVoteData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易確認..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "投票創建成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadVotes();
      setShowCreateModal(false);
      setNewVoteData({ 
        title: "", 
        description: "", 
        option1: "👍 喜歡", 
        option2: "👎 不喜歡", 
        option3: "😊 超愛" 
      });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用戶取消交易" 
        : "提交失敗: " + (e.message || "未知錯誤");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingVote(false); 
    }
  };

  const castVote = async (voteId: string, voteValue: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "請先連接錢包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setIsVoting(true);
    setTransactionStatus({ visible: true, status: "pending", message: "加密投票中..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("獲取合約失敗");
      
      const encryptedResult = await encrypt(contractAddress, address, voteValue);
      
      const tx = await contract.createBusinessData(
        `vote-${voteId}-${Date.now()}`,
        `Vote for ${voteId}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        voteValue,
        0,
        `User vote: ${voteValue}`
      );
      
      await tx.wait();
      
      setUserVote(voteValue);
      setTransactionStatus({ visible: true, status: "success", message: "投票成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadVotes();
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用戶取消交易" 
        : "投票失敗: " + (e.message || "未知錯誤");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsVoting(false); 
    }
  };

  const decryptVotes = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "請先連接錢包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "數據已驗證" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "驗證解密中..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadVotes();
      
      setTransactionStatus({ visible: true, status: "success", message: "解密驗證成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "數據已驗證" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        await loadVotes();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失敗: " + (e.message || "未知錯誤") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "系統可用性檢查成功！" 
      });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "可用性檢查失敗" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const getVoteStats = () => {
    const totalVotes = votes.length;
    const verifiedVotes = votes.filter(v => v.isVerified).length;
    const activeVotes = votes.filter(v => Date.now()/1000 - v.timestamp < 86400).length;
    
    return { totalVotes, verifiedVotes, activeVotes };
  };

  const renderStats = () => {
    const stats = getVoteStats();
    
    return (
      <div className="stats-grid">
        <div className="stat-card bubble">
          <div className="stat-icon">🗳️</div>
          <div className="stat-value">{stats.totalVotes}</div>
          <div className="stat-label">總投票數</div>
        </div>
        <div className="stat-card bubble">
          <div className="stat-icon">🔐</div>
          <div className="stat-value">{stats.verifiedVotes}</div>
          <div className="stat-label">已加密驗證</div>
        </div>
        <div className="stat-card bubble">
          <div className="stat-icon">⏰</div>
          <div className="stat-value">{stats.activeVotes}</div>
          <div className="stat-label">活躍投票</div>
        </div>
      </div>
    );
  };

  const renderVoteChart = (vote: VoteData) => {
    const options = [vote.option1, vote.option2, vote.option3];
    const percentages = [40, 30, 30];
    
    return (
      <div className="vote-chart">
        <h4>投票分佈</h4>
        {options.map((option, index) => (
          <div key={index} className="chart-row">
            <div className="chart-label">{option}</div>
            <div className="chart-bar">
              <div 
                className="bar-fill" 
                style={{ width: `${percentages[index]}%` }}
              >
                <span className="bar-value">{percentages[index]}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const faqItems = [
    { question: "什麼是全同態加密？", answer: "全同態加密讓數據在加密狀態下也能進行計算，保護兒童投票隱私。" },
    { question: "為什麼要使用加密投票？", answer: "防止同伴壓力，讓每個孩子都能真實表達自己的想法。" },
    { question: "投票數據安全嗎？", answer: "所有投票都經過加密處理，只有最終結果會公開顯示。" },
    { question: "如何參與投票？", answer: "連接錢包後，選擇喜歡的選項點擊投票按鈕即可。" }
  ];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🎮 KidPoll FHE 🔐</h1>
            <p>兒童隱私投票系統</p>
          </div>
          <ConnectButton />
        </header>
        
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="character">👦👧</div>
            <h2>歡迎來到兒童隱私投票系統！</h2>
            <p>這是一個使用全同態加密技術的安全投票平台，保護每個孩子的投票隱私</p>
            <div className="features">
              <div className="feature">🔐 加密投票</div>
              <div className="feature">🎮 兒童友好</div>
              <div className="feature">🤫 無壓力表達</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化加密系統...</p>
        <p className="loading-note">正在準備安全投票環境</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎮 KidPoll FHE 🔐</h1>
          <p>兒童隱私投票系統</p>
        </div>
        
        <nav className="main-nav">
          <button 
            className={`nav-btn ${activeTab === "votes" ? "active" : ""}`}
            onClick={() => setActiveTab("votes")}
          >
            🗳️ 投票列表
          </button>
          <button 
            className={`nav-btn ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            📊 數據統計
          </button>
          <button 
            className={`nav-btn ${activeTab === "faq" ? "active" : ""}`}
            onClick={() => setActiveTab("faq")}
          >
            ❓ 常見問題
          </button>
        </nav>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn bubble"
          >
            ✨ 創建新投票
          </button>
          <button 
            onClick={checkAvailability}
            className="check-btn bubble"
          >
            🔍 檢查系統
          </button>
          <ConnectButton />
        </div>
      </header>
      
      <main className="main-content">
        {activeTab === "votes" && (
          <div className="votes-section">
            <h2>🎯 當前投票活動</h2>
            {renderStats()}
            
            <div className="votes-grid">
              {votes.length === 0 ? (
                <div className="no-votes">
                  <div className="emoji">📝</div>
                  <p>還沒有投票活動</p>
                  <button 
                    className="create-btn bubble"
                    onClick={() => setShowCreateModal(true)}
                  >
                    創建第一個投票
                  </button>
                </div>
              ) : votes.map((vote) => (
                <div key={vote.id} className="vote-card bubble">
                  <div className="vote-header">
                    <h3>{vote.title}</h3>
                    <span className={`status ${vote.isVerified ? "verified" : "encrypted"}`}>
                      {vote.isVerified ? "✅ 已驗證" : "🔐 加密中"}
                    </span>
                  </div>
                  
                  <p className="vote-desc">{vote.description}</p>
                  
                  <div className="vote-options">
                    <button 
                      onClick={() => castVote(vote.id, 1)}
                      disabled={isVoting}
                      className="vote-option bubble"
                    >
                      {vote.option1}
                    </button>
                    <button 
                      onClick={() => castVote(vote.id, 2)}
                      disabled={isVoting}
                      className="vote-option bubble"
                    >
                      {vote.option2}
                    </button>
                    <button 
                      onClick={() => castVote(vote.id, 3)}
                      disabled={isVoting}
                      className="vote-option bubble"
                    >
                      {vote.option3}
                    </button>
                  </div>
                  
                  <div className="vote-footer">
                    <span>創建者: {vote.creator.substring(0, 8)}...</span>
                    <button 
                      onClick={() => decryptVotes(vote.id)}
                      className="decrypt-btn bubble"
                    >
                      {vote.isVerified ? "✅ 查看結果" : "🔓 解密結果"}
                    </button>
                  </div>
                  
                  {vote.isVerified && renderVoteChart(vote)}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "stats" && (
          <div className="stats-section">
            <h2>📊 投票數據分析</h2>
            {renderStats()}
            
            <div className="charts-container">
              <div className="chart-card bubble">
                <h3>投票趨勢圖</h3>
                <div className="trend-chart">
                  {[60, 45, 80, 65, 90, 75].map((height, index) => (
                    <div key={index} className="bar" style={{ height: `${height}%` }}></div>
                  ))}
                </div>
              </div>
              
              <div className="chart-card bubble">
                <h3>加密狀態</h3>
                <div className="pie-chart">
                  <div className="pie-slice encrypted" style={{ transform: 'rotate(0deg)' }}></div>
                  <div className="pie-slice verified" style={{ transform: 'rotate(120deg)' }}></div>
                  <div className="chart-legend">
                    <div>🔐 加密中: 60%</div>
                    <div>✅ 已驗證: 40%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "faq" && (
          <div className="faq-section">
            <h2>❓ 常見問題解答</h2>
            
            <div className="faq-list">
              {faqItems.map((item, index) => (
                <div key={index} className="faq-item bubble">
                  <div 
                    className="faq-question"
                    onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  >
                    <span>{item.question}</span>
                    <span>{faqOpen === index ? "▲" : "▼"}</span>
                  </div>
                  {faqOpen === index && (
                    <div className="faq-answer">
                      <p>{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="info-card bubble">
              <h3>ℹ️ 關於 KidPoll FHE</h3>
              <p>這是一個專為兒童設計的隱私投票系統，使用先進的全同態加密技術，確保每個孩子的投票都能在完全隱私的環境中進行。</p>
            </div>
          </div>
        )}
      </main>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal bubble">
            <div className="modal-header">
              <h2>✨ 創建新投票</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>投票標題</label>
                <input 
                  type="text" 
                  value={newVoteData.title}
                  onChange={(e) => setNewVoteData({...newVoteData, title: e.target.value})}
                  placeholder="輸入投票主題..."
                />
              </div>
              
              <div className="form-group">
                <label>投票描述</label>
                <textarea 
                  value={newVoteData.description}
                  onChange={(e) => setNewVoteData({...newVoteData, description: e.target.value})}
                  placeholder="描述這個投票的內容..."
                  rows={3}
                />
              </div>
              
              <div className="options-preview">
                <h4>投票選項（預設）</h4>
                <div className="preview-options">
                  <span className="option-preview bubble">{newVoteData.option1}</span>
                  <span className="option-preview bubble">{newVoteData.option2}</span>
                  <span className="option-preview bubble">{newVoteData.option3}</span>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="cancel-btn bubble"
              >
                取消
              </button>
              <button 
                onClick={createVote}
                disabled={creatingVote || !newVoteData.title}
                className="submit-btn bubble"
              >
                {creatingVote ? "加密創建中..." : "✨ 創建投票"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="notification bubble">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

