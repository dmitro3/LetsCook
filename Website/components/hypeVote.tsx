import { useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction, Connection, Keypair } from "@solana/web3.js";
import { Text, HStack, Tooltip } from "@chakra-ui/react";
import { PROGRAM, SYSTEM_KEY, Config, LaunchKeys } from "./Solana/constants";
import { LaunchData, get_current_blockhash, send_transaction, serialise_HypeVote_instruction, UserData } from "./Solana/state";
import bs58 from "bs58";
import Image from "next/image";
import UseWalletConnection from "../hooks/useWallet";
import useAppRoot from "../context/useAppRoot";
import { toast } from "react-toastify";
import useResponsive from "../hooks/useResponsive";
import BN from "bn.js";

export function HypeVote({
    launch_type,
    launch_id,
    page_name,
    positive_votes,
    negative_votes,
    seller_key,
    isTradePage,
}: {
    launch_type: number;
    launch_id: BN;
    page_name: string;
    positive_votes: number;
    negative_votes: number;
    seller_key: PublicKey;
    isTradePage?: boolean;
}) {
    const wallet = useWallet();
    const { connection } = useConnection();
    const { handleConnectWallet } = UseWalletConnection();
    const { checkProgramData, currentUserData } = useAppRoot();
    const { lg } = useResponsive();
    const hype_vote_ws_id = useRef<number | null>(null);

    const check_signature_update = useCallback(
        async (result: any) => {
            console.log(result);
            hype_vote_ws_id.current = null;

            // if we have a subscription field check against ws_id
            if (result.err !== null) {
                alert("Hype vote transaction failed, please try again");
                return;
            } else {
                await checkProgramData();
            }

            /*toast.success("First Hype Vote!",
            {
                position: "bottom-center",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "light",
                icon: ({theme, type}) =>  <img src="/images/thumbs-up.svg"/>
            });*/
        },
        [checkProgramData],
    );

    const Vote = useCallback(
        async ({ vote }: { vote: number }) => {
            if (wallet.publicKey === null || wallet.signTransaction === undefined) return;

            if (hype_vote_ws_id.current !== null) {
                alert("Hype vote pending, please wait");
                return;
            }

            let launch_data_account =
                launch_type === 0
                    ? PublicKey.findProgramAddressSync([Buffer.from(page_name), Buffer.from("Launch")], PROGRAM)[0]
                    : PublicKey.findProgramAddressSync([Buffer.from(page_name), Buffer.from("Collection")], PROGRAM)[0];

            let user_data_account = PublicKey.findProgramAddressSync([wallet.publicKey.toBytes(), Buffer.from("User")], PROGRAM)[0];

            const instruction_data = serialise_HypeVote_instruction(launch_type, launch_id, vote);

            var account_vector = [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: user_data_account, isSigner: false, isWritable: true },
                { pubkey: launch_data_account, isSigner: false, isWritable: true },
                { pubkey: SYSTEM_KEY, isSigner: false, isWritable: true },
            ];

            const list_instruction = new TransactionInstruction({
                keys: account_vector,
                programId: PROGRAM,
                data: instruction_data,
            });

            let txArgs = await get_current_blockhash("");

            let transaction = new Transaction(txArgs);
            transaction.feePayer = wallet.publicKey;

            transaction.add(list_instruction);

            try {
                let signed_transaction = await wallet.signTransaction(transaction);
                const encoded_transaction = bs58.encode(signed_transaction.serialize());

                var transaction_response = await send_transaction("", encoded_transaction);

                let signature = transaction_response.result;

                console.log("hype sig: ", signature);
                hype_vote_ws_id.current = connection.onSignature(signature, check_signature_update, "confirmed");
            } catch (error) {
                console.log(error);
                return;
            }
        },
        [wallet, connection, launch_type, launch_id, page_name, check_signature_update],
    );

    let has_voted: boolean = false;
    //console.log("check user vote", currentUserData === null)
    if (currentUserData !== null) {
        for (let i = 0; i < currentUserData.votes.length; i++) {
            //console.log("check hype", i, currentUserData.votes[i], launch_data.game_id);
            if (currentUserData.votes[i].toString() == launch_id.toString()) {
                has_voted = true;
                break;
            }
        }
    }
    // console.log("has_voted: ", has_voted);
    let total_votes = positive_votes + negative_votes;
    let vote_ratio = 0;
    let vote_color = "";
    if (total_votes > 0) {
        vote_ratio = positive_votes - negative_votes;
        if (vote_ratio > 0) {
            vote_color = "#83FF81";
        } else if (vote_ratio == 0) {
            vote_color = "#FFEE59";
        } else {
            vote_color = "#FF6E6E";
        }
    }

    if (wallet.publicKey !== null && wallet.publicKey.toString() === seller_key.toString()) {
        return (
            <>
                {total_votes > 0 && (
                    <Text m="0" fontSize={lg ? "large" : "x-large"} color={vote_color}>
                        {vote_ratio}
                    </Text>
                )}
                {total_votes === 0 && (
                    <Text m="0" fontSize={lg ? "large" : "x-large"} color="white">
                        --
                    </Text>
                )}
            </>
        );
    }

    if (has_voted) {
        return (
            <>
                <Text m="0" fontSize={lg ? "large" : "x-large"} color={vote_color}>
                    {vote_ratio}
                </Text>
            </>
        );
    }
    return (
        <>
            <HStack justify="center" align="center" gap={4} onClick={(e) => e.stopPropagation()}>
                <Tooltip label="Hype" hasArrow fontSize="large" offset={[0, 15]}>
                    <Image
                        onClick={() => {
                            if (wallet !== null) {
                                Vote({ vote: 1 });
                            } else {
                                handleConnectWallet();
                            }
                        }}
                        src="/images/thumbs-up.svg"
                        width={isTradePage ? 30 : 40}
                        height={isTradePage ? 30 : 40}
                        alt="Thumbs Up"
                    />
                </Tooltip>
                <Tooltip label="Not Hype" hasArrow fontSize="large" offset={[0, 15]}>
                    <Image
                        onClick={() => {
                            if (wallet !== null) {
                                Vote({ vote: 2 });
                            } else {
                                handleConnectWallet();
                            }
                        }}
                        src="/images/thumbs-down.svg"
                        width={isTradePage ? 30 : 40}
                        height={isTradePage ? 30 : 40}
                        alt="Thumbs Down"
                    />
                </Tooltip>
            </HStack>
        </>
    );
}
