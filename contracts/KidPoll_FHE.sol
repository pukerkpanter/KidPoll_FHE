pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract KidPoll_FHE is ZamaEthereumConfig {
    struct Poll {
        string title;
        euint32 encryptedVotes;
        uint256 totalVoters;
        string description;
        address creator;
        uint256 timestamp;
        uint32 decryptedVotes;
        bool isVerified;
    }

    mapping(string => Poll) public polls;
    string[] public pollIds;

    event PollCreated(string indexed pollId, address indexed creator);
    event DecryptionVerified(string indexed pollId, uint32 decryptedVotes);

    constructor() ZamaEthereumConfig() {}

    function createPoll(
        string calldata pollId,
        string calldata title,
        externalEuint32 encryptedVotes,
        bytes calldata inputProof,
        uint256 totalVoters,
        string calldata description
    ) external {
        require(bytes(polls[pollId].title).length == 0, "Poll already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedVotes, inputProof)), "Invalid encrypted input");

        polls[pollId] = Poll({
            title: title,
            encryptedVotes: FHE.fromExternal(encryptedVotes, inputProof),
            totalVoters: totalVoters,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedVotes: 0,
            isVerified: false
        });

        FHE.allowThis(polls[pollId].encryptedVotes);
        FHE.makePubliclyDecryptable(polls[pollId].encryptedVotes);
        pollIds.push(pollId);

        emit PollCreated(pollId, msg.sender);
    }

    function verifyDecryption(
        string calldata pollId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(polls[pollId].title).length > 0, "Poll does not exist");
        require(!polls[pollId].isVerified, "Data already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(polls[pollId].encryptedVotes);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));

        polls[pollId].decryptedVotes = decodedValue;
        polls[pollId].isVerified = true;

        emit DecryptionVerified(pollId, decodedValue);
    }

    function getEncryptedVotes(string calldata pollId) external view returns (euint32) {
        require(bytes(polls[pollId].title).length > 0, "Poll does not exist");
        return polls[pollId].encryptedVotes;
    }

    function getPollData(string calldata pollId) external view returns (
        string memory title,
        uint256 totalVoters,
        string memory description,
        address creator,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedVotes
    ) {
        require(bytes(polls[pollId].title).length > 0, "Poll does not exist");
        Poll storage poll = polls[pollId];

        return (
            poll.title,
            poll.totalVoters,
            poll.description,
            poll.creator,
            poll.timestamp,
            poll.isVerified,
            poll.decryptedVotes
        );
    }

    function getAllPollIds() external view returns (string[] memory) {
        return pollIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

