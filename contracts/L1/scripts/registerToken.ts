import { ethers } from 'ethers';
import { configDotenv } from 'dotenv'
import chalk from 'chalk'
import inquirer from 'inquirer';

configDotenv();

// === MINIMAL BRIDGE ABI ==================================================================================

const BRIDGE_ABI = [
  {
    "inputs": [
      {
        "internalType": "enum AssetType",
        "name": "assetType",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "priceFeed",
        "type": "address"
      },
      {
        "internalType": "uint8",
        "name": "decimals",
        "type": "uint8"
      }
    ],
    "name": "registerToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// === Types (or objects, depending on how you see it) ==================================================================================

enum AssetType {
    ETH,
    ERC20
}

enum CHAINLINK_SEPOLIA_PRICEFEEDS {
    AUD_USD='0xB0C712f98daE15264c8E26132BCC91C40aD4d5F9',
    BTC_ETH='0x5fb1616F78dA7aFC9FF79e0371741a747D2a7F22',
    BTC_USD='0x38c8b98A2Cb36a55234323D7eCCD36ad3bFC5954',
    CASH_NAV='0xd988B5d6E40A38D87d85491Da1110D2de904E245',
    CSPX_USD='0x4b531A318B0e44B549F3b2f824721b3D0d51930A',
    CZK_USD='0xC32f0A9D70A34B9E7377C10FDAd88512596f61EA',
    DAI_USD='0x14866185B1962B63C3Ea9E03Bc1da838bab34C19',
    ETH_USD='0x694AA1769357215DE4FAC081bf1f309aDC325306',
}

// === Main function ==================================================================================

async function main() {

    /**
        * Check environment variables
    */

    if (!process.env.SEPOLIA_RPC_URL) {
        chalk.red('RPC URL not found in environment variables');
        process.exit(1);
    }

    if (!process.env.ZEROXBRIDGE_CONTRACT_ADDRESS) {
        chalk.red('ZeroXBridge Contract Address not found in environment variables');
        process.exit(1);
    }

    if (!process.env.PRIVATE_KEY) {
        chalk.red('Admin Private key not found in environment variables');
        process.exit(1);
    }

    console.log("Env good, starting now")

    /**
        * Build three variables with ether.js
    */

    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(process.env.ZEROXBRIDGE_CONTRACT_ADDRESS, BRIDGE_ABI, wallet);

    console.log(chalk.green(`Connected at ${process.env.ZEROXBRIDGE_CONTRACT_ADDRESS}`));
    console.log(chalk.green(`Using Account: ${wallet.address}\n`))

    /**
        * Interact with user using inquirer
    */

    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'assetType',
            message: 'select asset type',
            choices: [
                { name: 'ETH', value: AssetType.ETH },
                { name: 'ERC20', value: AssetType.ERC20 }
            ]
        },
        {
            type: 'input',
            name: 'tokenAddress',
            message: 'Token Address (leave empty for ETH):',
            when: (answers) => answers.assetType === AssetType.ERC20,
            validate: (input) => {
                if (!input) return true //Empty is OK for ETH
                if (!ethers.isAddress(input)) {
                    return 'Invalid Ethereum address format'
                }
                return true
            },
            filter: (input) => {
                if (!input || input === '0x0') return ethers.ZeroAddress;
                return ethers.getAddress(input);
            }
        },
        {
            type: 'select',
            name: 'priceFeed',
            message: 'Price Feed Address',
            choices: [
                { name: 'BTC/ETH', value: CHAINLINK_SEPOLIA_PRICEFEEDS.BTC_ETH },
                { name: 'BTC/USD', value: CHAINLINK_SEPOLIA_PRICEFEEDS.BTC_USD },
                { name: 'CASH NAV', value: CHAINLINK_SEPOLIA_PRICEFEEDS.CASH_NAV },
                { name: 'CSPX/USD', value: CHAINLINK_SEPOLIA_PRICEFEEDS.CSPX_USD },
                { name: 'CZK/USD', value: CHAINLINK_SEPOLIA_PRICEFEEDS.CZK_USD },
                { name: 'DAI/USD', value: CHAINLINK_SEPOLIA_PRICEFEEDS.DAI_USD },
                { name: 'ETH/USD', value: CHAINLINK_SEPOLIA_PRICEFEEDS.ETH_USD }
            ]
        },
        {
            type: 'number',
            name: 'decimals',
            message: 'Token Decimals',
            default: 18,
            validate: (input) => {
                if (!input) return false;
                if (input < 0 || input > 255 || !Number.isInteger(input)) {
                    return 'Decimals must integers be between 0 and 255'
                }
                return true;
            }
        },
    ])

    if (answers.assetType === AssetType.ETH) {
        answers.tokenAddress = ethers.ZeroAddress;
    }

    console.log('Ok, I will start now');
    console.log(`\n` + chalk.yellow(`Transaction Preview: `));
    console.log(`Asset type: ${AssetType[answers.assetType]}`);
    console.log(`TOken Address: ${answers.tokenAddress}`);
    console.log(`Price Feed: ${answers.priceFeed}`);
    console.log(`Decimals: ${answers.decimals}`);
    console.log(`From: ${wallet.address}`);
    console.log(`Contract: ${process.env.ZEROXBRIDGE_CONTRACT_ADDRESS}`);

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Review and confirm transaction',
            default: false
        }
    ])

    if (!confirm) {
        console.log(chalk.yellow('Transaction cancelled by user'));
        process.exit(0);
    }

    /**
        * Main action in try-catch block
    */

    try {
        console.log(chalk.blue('Sending Transaction...'));

        const tx = await contract.registerToken(
            answers.assetType, answers.tokenAddress, answers.priceFeed, answers.decimals
        );

        console.log(chalk.green(`Transaction sent: ${tx.hash}`));

        const receipt = await tx.wait();
        if (receipt.status === 0) {
            console.log(chalk.red('Transaction failed'));
            process.exit(1);
        }

        console.log('\n' + chalk.green('TRANSACTION SUCCESSFUL'));
        console.log(chalk.cyan('Transaction Hash: ') + receipt.hash);
        console.log(chalk.cyan('Block Number: ') + receipt.blockNumber);
        console.log(chalk.cyan('Gas Used: ') + receipt.gasUsed.toString());
        console.log(chalk.green('Token registered successfully!'));
        process.exit(0);
    } catch (err) {
        console.error(chalk.red('Transaction failed:'));
        console.error(chalk.red((err as Error).message));
        
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
})