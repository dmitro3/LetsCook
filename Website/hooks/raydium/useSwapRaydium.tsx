import {
    LaunchInstruction,
    get_current_blockhash,
    myU64,
    send_transaction,
    serialise_basic_instruction,
    request_current_balance,
    uInt32ToLEBytes,
    bignum_to_num,
    getRecentPrioritizationFees,
} from "../../components/Solana/state";
import { PublicKey, Transaction, TransactionInstruction, Connection } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { PROGRAM, Config, SYSTEM_KEY, SOL_ACCOUNT_SEED } from "../../components/Solana/constants";
import { useCallback, useRef, useState } from "react";
import bs58 from "bs58";
import BN from "bn.js";
import { toast } from "react-toastify";

import { ComputeBudgetProgram } from "@solana/web3.js";

import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LaunchKeys, TIMEOUT } from "../../components/Solana/constants";
import { make_tweet } from "../../components/launch/twitter";
import { BeetStruct, bignum, u64, u8, uniformFixedSizeArray } from "@metaplex-foundation/beet";
import {
    RAYDIUM_PROGRAM,
    getObservationAccount,
    getAMMConfigAccount,
    getAMMBaseAccount,
    getAMMQuoteAccount,
    getAuthorityAccount,
    getLPMintAccount,
    getPoolStateAccount,
} from "./useCreateCP";
import { AMMData } from "../../components/Solana/jupiter_state";
import { getMintData } from "@/components/amm/launch";
import useSendTransaction from "../useSendTransaction";

function serialise_raydium_swap_instruction(token_amount: number, sol_amount: number, order_type: number): Buffer {
    let base_in_discriminator: number[] = [143, 190, 90, 218, 196, 30, 51, 222];
    let base_out_discriminator: number[] = [55, 217, 98, 86, 163, 74, 180, 173];

    let discriminator = order_type === 0 ? base_out_discriminator : base_in_discriminator;
    let inAmount = order_type === 0 ? sol_amount : token_amount;
    let outAmount = order_type === 0 ? token_amount : sol_amount;

    console.log("in and out:", inAmount, outAmount);
    const data = new RaydiumSwap_Instruction(LaunchInstruction.raydium_swap, order_type, discriminator, inAmount, outAmount);

    const [buf] = RaydiumSwap_Instruction.struct.serialize(data);

    return buf;
}

class RaydiumSwap_Instruction {
    constructor(
        readonly instruction: number,
        readonly side: number,
        readonly discriminator: number[],
        readonly in_amount: bignum,
        readonly out_amount: bignum,
    ) {}

    static readonly struct = new BeetStruct<RaydiumSwap_Instruction>(
        [
            ["instruction", u8],
            ["side", u8],
            ["discriminator", uniformFixedSizeArray(u8, 8)],
            ["in_amount", u64],
            ["out_amount", u64],
        ],
        (args) => new RaydiumSwap_Instruction(args.instruction!, args.side!, args.discriminator!, args.in_amount!, args.out_amount!),
        "RaydiumSwap_Instruction",
    );
}
export const GetSwapRaydiumInstruction = async (
    user: PublicKey,
    amm: AMMData,
    token_amount: number,
    sol_amount: number,
    order_type: number,
): Promise<TransactionInstruction> => {
    // if we have already done this then just skip this step
    let base_mint = amm.base_mint;
    let quote_mint = new PublicKey("So11111111111111111111111111111111111111112");

    let base_mint_data = await getMintData(base_mint.toString());
    let quote_mint_data = await getMintData(quote_mint.toString());

    let authority = getAuthorityAccount();
    let pool_state = getPoolStateAccount(base_mint, quote_mint);
    let amm_config = getAMMConfigAccount();
    let observation = getObservationAccount(base_mint, quote_mint);

    let amm_input = order_type === 0 ? getAMMQuoteAccount(base_mint, quote_mint) : getAMMBaseAccount(base_mint, quote_mint);
    let amm_output = order_type === 0 ? getAMMBaseAccount(base_mint, quote_mint) : getAMMQuoteAccount(base_mint, quote_mint);

    let tp_input = order_type === 0 ? quote_mint_data.token_program : base_mint_data.token_program;
    let tp_output = order_type === 0 ? base_mint_data.token_program : quote_mint_data.token_program;

    let user_base_account = await getAssociatedTokenAddress(
        amm.base_mint, // mint
        user, // owner
        true, // allow owner off curve
        base_mint_data.token_program,
    );

    let user_quote_account = await getAssociatedTokenAddress(
        quote_mint, // mint
        user, // owner
        true, // allow owner off curve
        quote_mint_data.token_program,
    );

    let amm_seed_keys = [];
    if (base_mint.toString() < quote_mint.toString()) {
        amm_seed_keys.push(base_mint);
        amm_seed_keys.push(quote_mint);
    } else {
        amm_seed_keys.push(quote_mint);
        amm_seed_keys.push(base_mint);
    }

    let amm_data_account = PublicKey.findProgramAddressSync(
        [amm_seed_keys[0].toBytes(), amm_seed_keys[1].toBytes(), Buffer.from("RaydiumCPMM")],
        PROGRAM,
    )[0];

    console.log(bignum_to_num(amm.start_time));
    let current_date = Math.floor((new Date().getTime() / 1000 - bignum_to_num(amm.start_time)) / 24 / 60 / 60);
    let date_bytes = uInt32ToLEBytes(current_date);

    let launch_date_account = PublicKey.findProgramAddressSync(
        [amm_data_account.toBytes(), date_bytes, Buffer.from("LaunchDate")],
        PROGRAM,
    )[0];

    let user_date_account = PublicKey.findProgramAddressSync([amm_data_account.toBytes(), user.toBytes(), date_bytes], PROGRAM)[0];
    console.log(current_date, launch_date_account.toString(), user_date_account.toString());

    let user_input = order_type === 0 ? user_quote_account : user_base_account;
    let user_output = order_type === 0 ? user_base_account : user_quote_account;

    let mint_input = order_type === 0 ? quote_mint : base_mint;
    let mint_output = order_type === 0 ? base_mint : quote_mint;

    const keys = [
        { pubkey: user, isSigner: true, isWritable: false },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: amm_config, isSigner: false, isWritable: false },
        { pubkey: pool_state, isSigner: false, isWritable: true },
        { pubkey: user_input, isSigner: false, isWritable: true },
        { pubkey: user_output, isSigner: false, isWritable: true },
        { pubkey: amm_input, isSigner: false, isWritable: true },
        { pubkey: amm_output, isSigner: false, isWritable: true },

        { pubkey: tp_input, isSigner: false, isWritable: false },
        { pubkey: tp_output, isSigner: false, isWritable: false },
        { pubkey: mint_input, isSigner: false, isWritable: false },
        { pubkey: mint_output, isSigner: false, isWritable: false },
        { pubkey: observation, isSigner: false, isWritable: true },
        { pubkey: RAYDIUM_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: launch_date_account, isSigner: false, isWritable: true },
        { pubkey: user_date_account, isSigner: false, isWritable: true },
        { pubkey: amm_data_account, isSigner: false, isWritable: true },

        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_KEY, isSigner: false, isWritable: false },
    ];

    let raydium_swap_data = serialise_raydium_swap_instruction(token_amount, sol_amount, order_type);

    const list_instruction = new TransactionInstruction({
        keys: keys,
        programId: PROGRAM,
        data: raydium_swap_data,
    });

    return list_instruction;
};
const useSwapRaydium = (amm: AMMData) => {
    const wallet = useWallet();

    const { sendTransaction, isLoading } = useSendTransaction();

    const SwapRaydium = async (token_amount: number, sol_amount: number, order_type: number) => {
        let instruction = await GetSwapRaydiumInstruction(wallet.publicKey, amm, token_amount, sol_amount, order_type);

        await sendTransaction({
            instructions: [instruction],
            onSuccess: () => {
                // Handle success
            },
            onError: (error) => {
                // Handle error
            },
        });
    };

    return { SwapRaydium, isLoading };
};

export default useSwapRaydium;
