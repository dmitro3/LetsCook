import { Dispatch, SetStateAction, MutableRefObject, useCallback, useRef, useState } from "react";

import { LaunchDataUserInput, LaunchInstruction, uInt32ToLEBytes } from "../../components/Solana/state";
import {
    DEBUG,
    SYSTEM_KEY,
    PROGRAM,
    Config,
    LaunchKeys,
    LaunchFlags,
    DATA_ACCOUNT_SEED,
    SOL_ACCOUNT_SEED,
    TIMEOUT,
} from "../../components/Solana/constants";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";
import "react-datepicker/dist/react-datepicker.css";
import bs58 from "bs58";
import { toast } from "react-toastify";
import { useRouter } from "next/router";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getAMMBaseAccount, getAMMQuoteAccount, getLPMintAccount } from "../raydium/useCreateCP";
import { FixableBeetStruct, array, u8, utf8String } from "@metaplex-foundation/beet";
import { NewListing } from "../../components/listing/launch";
import useSendTransaction from "../useSendTransaction";

class CreateListing_Instruction {
    constructor(
        readonly instruction: number,
        readonly name: string,
        readonly symbol: string,
        readonly icon: string,
        readonly uri: string,
        readonly banner: string,
        readonly description: string,
        readonly website: string,
        readonly twitter: string,
        readonly telegram: string,
        readonly discord: string,
    ) {}

    static readonly struct = new FixableBeetStruct<CreateListing_Instruction>(
        [
            ["instruction", u8],
            ["name", utf8String],
            ["symbol", utf8String],
            ["icon", utf8String],
            ["uri", utf8String],
            ["banner", utf8String],
            ["description", utf8String],
            ["website", utf8String],
            ["twitter", utf8String],
            ["telegram", utf8String],
            ["discord", utf8String],
        ],
        (args) =>
            new CreateListing_Instruction(
                args.instruction!,
                args.name!,
                args.symbol!,
                args.icon!,
                args.uri!,
                args.banner!,
                args.description!,
                args.website!,
                args.twitter!,
                args.telegram!,
                args.discord!,
            ),
        "CreateListing_Instruction",
    );
}

function serialise_CreateListing_instruction(new_listing: NewListing): Buffer {
    const data = new CreateListing_Instruction(
        LaunchInstruction.create_unverified_listing,
        new_listing.name,
        new_listing.symbol,
        new_listing.icon,
        new_listing.uri,
        new_listing.banner,
        new_listing.description,
        new_listing.website,
        new_listing.twitter,
        new_listing.telegram,
        new_listing.discord,
    );
    const [buf] = CreateListing_Instruction.struct.serialize(data);

    return buf;
}
export const GetEditListingInstruction = async (user: PublicKey, new_listing: NewListing): Promise<TransactionInstruction> => {
    if (user === null) return;

    const connection = new Connection(Config.RPC_NODE, { wsEndpoint: Config.WSS_NODE });

    let program_data_account = PublicKey.findProgramAddressSync([uInt32ToLEBytes(DATA_ACCOUNT_SEED)], PROGRAM)[0];
    let program_sol_account = PublicKey.findProgramAddressSync([uInt32ToLEBytes(SOL_ACCOUNT_SEED)], PROGRAM)[0];
    let token_mint = new PublicKey(new_listing.token);
    let user_data_account = PublicKey.findProgramAddressSync([user.toBytes(), Buffer.from("User")], PROGRAM)[0];

    if (new_listing.token === "So11111111111111111111111111111111111111112") {
        toast.error("Dont add WSOL");
        return;
    }

    let listing = PublicKey.findProgramAddressSync([token_mint.toBytes(), Buffer.from("Listing")], PROGRAM)[0];

    const instruction_data = serialise_CreateListing_instruction(new_listing);

    var account_vector = [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: user_data_account, isSigner: false, isWritable: true },
        { pubkey: listing, isSigner: false, isWritable: true },
        { pubkey: program_data_account, isSigner: false, isWritable: true },
        { pubkey: program_sol_account, isSigner: false, isWritable: true },
        { pubkey: token_mint, isSigner: false, isWritable: true },
        { pubkey: SYSTEM_KEY, isSigner: false, isWritable: false },
    ];

    const list_instruction = new TransactionInstruction({
        keys: account_vector,
        programId: PROGRAM,
        data: instruction_data,
    });
    return list_instruction;
};
const useEditListing = () => {
    const wallet = useWallet();
    const router = useRouter();
    const { sendTransaction, isLoading } = useSendTransaction();

    const EditListing = async (new_listing: NewListing) => {
        let instruction = await GetEditListingInstruction(wallet.publicKey, new_listing);
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
    return { EditListing };
};

export default useEditListing;
