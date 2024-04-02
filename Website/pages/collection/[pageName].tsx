import { VStack, Text, HStack, Progress, Button, Tooltip, Link } from "@chakra-ui/react";
import { bignum_to_num } from "../../components/Solana/state";
import { useRef, useEffect, useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Image from "next/image";
import useResponsive from "../../hooks/useResponsive";
import UseWalletConnection from "../../hooks/useWallet";
import FeaturedBanner from "../../components/featuredBanner";
import Head from "next/head";
import { MdOutlineContentCopy } from "react-icons/md";
import trimAddress from "../../utils/trimAddress";
import useAppRoot from "../../context/useAppRoot";
import { AssignmentData, CollectionData } from "../../components/collection/collectionState";
import PageNotFound from "../../components/pageNotFound";
import Loader from "../../components/loader";
import CollectionFeaturedBanner from "../../components/collectionFeaturedBanner";
import useClaimNFT from "../../hooks/collections/useClaimNFT";
import { CollectionKeys, WSS_NODE, RPC_NODE, PROGRAM } from "../../components/Solana/constants";
import { PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import useWrapNFT from "../../hooks/collections/useWrapNFT";
import useMintNFT from "../../hooks/collections/useMintNFT";

function findLaunch(list: CollectionData[], page_name: string | string[]) {
    if (list === null || list === undefined || page_name === undefined || page_name === null) return null;

    let launchList = list.filter(function (item) {
        //console.log(new Date(bignum_to_num(item.launch_date)), new Date(bignum_to_num(item.end_date)))
        return item.page_name == page_name;
    });

    return launchList[0];
}

const CollectionSwapPage = () => {
    const wallet = useWallet();
    const router = useRouter();
    const { pageName } = router.query;
    const { xs, sm, md, lg } = useResponsive();
    const { handleConnectWallet } = UseWalletConnection();
    const { collectionList } = useAppRoot();
    const [launch, setCollectionData] = useState<CollectionData | null>(null);
    const [assigned_nft, setAssignedNFT] = useState<AssignmentData | null>(null);

    const launch_account_ws_id = useRef<number | null>(null);
    const nft_account_ws_id = useRef<number | null>(null);
    const mint_nft = useRef<boolean>(false);

    const { ClaimNFT } = useClaimNFT(launch);
    const { MintNFT } = useMintNFT(launch);
    const { WrapNFT } = useWrapNFT(launch);

    useEffect(() => {
        let launch = findLaunch(collectionList, pageName);
        setCollectionData(launch);
    }, [collectionList, pageName]);

    // when page unloads unsub from any active websocket listeners

    useEffect(() => {
        return () => {
            console.log("in use effect return");
            const unsub = async () => {
                const connection = new Connection(RPC_NODE, { wsEndpoint: WSS_NODE });
                if (launch_account_ws_id.current !== null) {
                    await connection.removeAccountChangeListener(launch_account_ws_id.current);
                    launch_account_ws_id.current = null;
                }
                if (nft_account_ws_id.current !== null) {
                    await connection.removeAccountChangeListener(nft_account_ws_id.current);
                    nft_account_ws_id.current = null;
                }
            };
            unsub();
        };
    }, []);

    useEffect(() => {
        let launch = findLaunch(collectionList, pageName);
        console.log(launch);
        setCollectionData(launch);
    }, [collectionList, pageName]);

    useEffect(() => {
        if (assigned_nft === null || !mint_nft.current) {
            return;
        }

        MintNFT();

        mint_nft.current = false;
    }, [assigned_nft, MintNFT]);

    const check_launch_update = useCallback(
        async (result: any) => {
            console.log("collection", result);
            // if we have a subscription field check against ws_id

            let event_data = result.data;

            console.log("have collection data", event_data, launch_account_ws_id.current);
            let account_data = Buffer.from(event_data, "base64");

            const [updated_data] = CollectionData.struct.deserialize(account_data);

            console.log(updated_data);

            if (updated_data.num_available !== launch.num_available) {
                setCollectionData(updated_data);
            }
        },
        [launch],
    );
    const check_assignment_update = useCallback(async (result: any) => {
        console.log("assignment", result);
        // if we have a subscription field check against ws_id

        let event_data = result.data;

        console.log("have assignment data", event_data);
        let account_data = Buffer.from(event_data, "base64");

        if (account_data.length === 0) {
            console.log("account deleted");
            setAssignedNFT(null);
            mint_nft.current = false;
            return;
        }

        const [updated_data] = AssignmentData.struct.deserialize(account_data);

        console.log(updated_data);
        mint_nft.current = true;
        setAssignedNFT(updated_data);
    }, []);

    useEffect(() => {
        if (launch === null) return;

        const connection = new Connection(RPC_NODE, { wsEndpoint: WSS_NODE });

        if (launch_account_ws_id.current === null) {
            console.log("subscribe 1");
            let launch_data_account = PublicKey.findProgramAddressSync(
                [Buffer.from(launch.page_name), Buffer.from("Collection")],
                PROGRAM,
            )[0];

            launch_account_ws_id.current = connection.onAccountChange(launch_data_account, check_launch_update, "confirmed");
        }

        if (nft_account_ws_id.current === null) {
            console.log("subscribe 2");
            let nft_assignment_account = PublicKey.findProgramAddressSync(
                [wallet.publicKey.toBytes(), launch.keys[CollectionKeys.CollectionMint].toBytes(), Buffer.from("assignment")],
                PROGRAM,
            )[0];
            nft_account_ws_id.current = connection.onAccountChange(nft_assignment_account, check_assignment_update, "confirmed");
        }
    }, [wallet, launch, check_launch_update, check_assignment_update]);

    if (!pageName) return;

    if (launch === null) return <Loader />;

    if (!launch) return <PageNotFound />;

    return (
        <>
            <Head>
                <title>Let&apos;s Cook | {pageName}</title>
            </Head>
            <main style={{ background: "linear-gradient(180deg, #292929 10%, #0B0B0B 100%)" }}>
                <CollectionFeaturedBanner featuredLaunch={launch} isHomePage={false} />
                <div style={{ padding: "16px" }}>
                    <VStack
                        p={md ? 22 : 50}
                        bg="rgba(225, 225, 225, 0.20)"
                        borderRadius={12}
                        border="1px solid white"
                        h="500px"
                        justifyContent="space-between"
                    >
                        <Text m={0} align="start" className="font-face-kg" color={"white"} fontSize="xx-large">
                            Hybrid Wrap
                        </Text>
                        <HStack spacing={24} alignItems="start">
                            <VStack>
                                <Image
                                    src={launch.token_icon_url}
                                    width={180}
                                    height={180}
                                    alt="Image Frame"
                                    style={{ backgroundSize: "cover", borderRadius: 12 }}
                                />
                                <Text mt={1} mb={0} color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                    {launch.token_symbol}
                                </Text>
                                <HStack spacing={2} align="start" justify="start">
                                    <Text m={0} color={"white"} fontFamily="ReemKufiRegular" fontSize={"large"}>
                                        CA: {trimAddress(launch.keys[CollectionKeys.MintAddress].toString())}
                                    </Text>

                                    <Tooltip label="Copy Contract Address" hasArrow fontSize="large" offset={[0, 10]}>
                                        <div
                                            style={{ cursor: "pointer" }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                navigator.clipboard.writeText("");
                                            }}
                                        >
                                            <MdOutlineContentCopy color="white" size={lg ? 22 : 22} />
                                        </div>
                                    </Tooltip>

                                    <Tooltip label="View in explorer" hasArrow fontSize="large" offset={[0, 10]}>
                                        <Link target="_blank" onClick={(e) => e.stopPropagation()}>
                                            <Image
                                                src="/images/solscan.png"
                                                width={lg ? 22 : 22}
                                                height={lg ? 22 : 22}
                                                alt="Solscan icon"
                                            />
                                        </Link>
                                    </Tooltip>
                                </HStack>
                            </VStack>

                            <VStack spacing={3} margin="auto 0">
                                <Button onClick={() => ClaimNFT()}>{bignum_to_num(launch.swap_price)} Tokens = 1 NFT</Button>
                                <Button onClick={() => WrapNFT()}>
                                    1 NFT = {bignum_to_num(launch.swap_price)} - {bignum_to_num(launch.swap_fee)}% Tokens
                                </Button>
                            </VStack>

                            <VStack>
                                <Image
                                    src={launch.collection_icon_url}
                                    width={180}
                                    height={180}
                                    alt="Image Frame"
                                    style={{ backgroundSize: "cover", borderRadius: 12 }}
                                />
                                <Text mt={1} mb={0} color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                    {launch.collection_name}
                                </Text>
                            </VStack>
                        </HStack>
                        <VStack spacing={0} w="100%" style={{ position: "relative" }}>
                            <Text color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                Available Supply
                            </Text>
                            <HStack w="100%" style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
                                <Progress
                                    w="100%"
                                    h={29}
                                    borderRadius={20}
                                    sx={{
                                        "& > div": {
                                            background: "linear-gradient(180deg, #8DFE7A 0%, #3E9714 100%)",
                                        },
                                    }}
                                    size="sm"
                                    min={0}
                                    max={launch.total_supply}
                                    value={launch.num_available}
                                    boxShadow="0px 5px 15px 0px rgba(0,0,0,0.6) inset"
                                />
                                <HStack style={{ position: "absolute", zIndex: 1 }}>
                                    <HStack justify="center">
                                        <Text m="0" color="black" fontSize={sm ? "medium" : "large"} fontFamily="ReemKufiRegular">
                                            {launch.num_available} / {launch.total_supply}
                                        </Text>
                                    </HStack>
                                </HStack>
                            </HStack>
                        </VStack>
                    </VStack>
                </div>
            </main>
        </>
    );
};

export default CollectionSwapPage;
