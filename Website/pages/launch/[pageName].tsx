import {
    Center,
    VStack,
    Text,
    Box,
    HStack,
    Flex,
    Tooltip,
    Checkbox,
    Input,
    Button,
    useNumberInput,
    Progress,
    Divider,
} from "@chakra-ui/react";
import { LaunchData, bignum_to_num, myU64, JoinData, request_raw_account_data, MintData } from "../../components/Solana/state";
import { PROGRAM, Config } from "../../components/Solana/constants";
import { useCallback, useEffect, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { MdOutlineContentCopy } from "react-icons/md";
import { PieChart } from "react-minimal-pie-chart";
import { useRouter } from "next/router";
import Image from "next/image";
import useResponsive from "../../hooks/useResponsive";
import UseWalletConnection from "../../hooks/useWallet";
import trimAddress from "../../utils/trimAddress";
import WoodenButton from "../../components/Buttons/woodenButton";
import PageNotFound from "../../components/pageNotFound";
import useInitAMM from "../../hooks/jupiter/useInitAMM";
import useCheckTickets from "../../hooks/launch/useCheckTickets";
import useBuyTickets from "../../hooks/launch/useBuyTickets";
import useClaimTickets from "../../hooks/launch/useClaimTokens";
import useRefundTickets from "../../hooks/launch/useRefundTickets";
import FeaturedBanner from "../../components/featuredBanner";
import Timespan from "../../components/launchPreview/timespan";
import TokenDistribution from "../../components/launchPreview/tokenDistribution";
import useDetermineCookState, { CookState } from "../../hooks/useDetermineCookState";
import Loader from "../../components/loader";
import { WarningModal } from "../../components/Solana/modals";
import { ButtonString } from "../../components/user_status";
import Head from "next/head";
import useAppRoot from "../../context/useAppRoot";
import { getSolscanLink } from "../../utils/getSolscanLink";
import Link from "next/link";

const TokenMintPage = () => {
    const wallet = useWallet();
    const router = useRouter();
    const { mintData } = useAppRoot();

    const { pageName } = router.query;
    const { xs, sm, md, lg } = useResponsive();
    const { handleConnectWallet } = UseWalletConnection();

    const [totalCost, setTotalCost] = useState(0);
    const [ticketPrice, setTicketPrice] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const [launchData, setLaunchData] = useState<LaunchData | null>(null);
    const [join_data, setJoinData] = useState<JoinData | null>(null);
    const [cookState, setCookState] = useState<CookState | null>(null);
    const [whitelist, setWhitelist] = useState<MintData | null>(null);

    let current_time = new Date().getTime();

    const { getInputProps, getIncrementButtonProps, getDecrementButtonProps } = useNumberInput({
        step: 1,
        defaultValue: 1,
        min: 1,
        max: 1000,
    });

    const inc = getIncrementButtonProps();
    const dec = getDecrementButtonProps();
    const input = getInputProps();

    const { value } = input;

    const { BuyTickets, openWarning, isWarningOpened, closeWarning } = useBuyTickets({ launchData, value });
    const { CheckTickets, isLoading: isCheckingTickets } = useCheckTickets(launchData);
    const { ClaimTokens, isLoading: isClamingTokens } = useClaimTickets(launchData);
    const { RefundTickets, isLoading: isRefundingTickets } = useRefundTickets(launchData);

    const { InitAMM } = useInitAMM(launchData);

    const cook_state = useDetermineCookState({ current_time, launchData, join_data });

    const checkLaunchData = useRef<boolean>(true);

    // updates to token page are checked using a websocket to get real time updates
    const join_account_ws_id = useRef<number | null>(null);
    const launch_account_ws_id = useRef<number | null>(null);

    // when page unloads unsub from any active websocket listeners
    useEffect(() => {
        return () => {
            console.log("in use effect return");
            const unsub = async () => {
                const connection = new Connection(Config.RPC_NODE, { wsEndpoint: Config.WSS_NODE });
                if (join_account_ws_id.current !== null) {
                    await connection.removeAccountChangeListener(join_account_ws_id.current);
                    join_account_ws_id.current = null;
                }
                if (launch_account_ws_id.current !== null) {
                    await connection.removeAccountChangeListener(launch_account_ws_id.current);
                    launch_account_ws_id.current = null;
                }
                await connection.removeAccountChangeListener(launch_account_ws_id.current);
            };
            unsub();
        };
    }, []);

    const check_launch_update = useCallback(
        async (result: any) => {
            console.log(result);
            // if we have a subscription field check against ws_id

            let event_data = result.data;

            console.log("have event data", event_data, launch_account_ws_id.current);
            let account_data = Buffer.from(event_data, "base64");

            const [updated_data] = LaunchData.struct.deserialize(account_data);

            console.log(updated_data);

            if (updated_data.num_interactions > launchData.num_interactions) {
                setLaunchData(updated_data);
            }
        },
        [launchData],
    );

    const check_join_update = useCallback(
        async (result: any) => {
            console.log(result);
            // if we have a subscription field check against ws_id

            let event_data = result.data;

            console.log("have event data", event_data, join_account_ws_id.current);
            let account_data = Buffer.from(event_data, "base64");
            try {
                const [updated_data] = JoinData.struct.deserialize(account_data);

                console.log(updated_data);

                if (join_data === null) {
                    setJoinData(updated_data);
                    return;
                }

                if (updated_data.num_tickets > join_data.num_tickets || updated_data.num_claimed_tickets > join_data.num_claimed_tickets) {
                    setJoinData(updated_data);
                }
            } catch (error) {
                console.log("error reading join data");
                setJoinData(null);
            }
        },
        [join_data],
    );

    // launch account subscription handler
    useEffect(() => {
        if (launchData === null) return;

        const connection = new Connection(Config.RPC_NODE, { wsEndpoint: Config.WSS_NODE });

        if (launch_account_ws_id.current === null) {
            console.log("subscribe 1");
            let launch_data_account = PublicKey.findProgramAddressSync(
                [Buffer.from(launchData.page_name), Buffer.from("Launch")],
                PROGRAM,
            )[0];

            launch_account_ws_id.current = connection.onAccountChange(launch_data_account, check_launch_update, "confirmed");
        }

        if (join_account_ws_id.current === null && wallet !== null && wallet.publicKey !== null) {
            console.log("subscribe 2");
            const game_id = new myU64(launchData.game_id);
            const [game_id_buf] = myU64.struct.serialize(game_id);

            let user_join_account = PublicKey.findProgramAddressSync(
                [wallet.publicKey.toBytes(), game_id_buf, Buffer.from("Joiner")],
                PROGRAM,
            )[0];

            join_account_ws_id.current = connection.onAccountChange(user_join_account, check_join_update, "confirmed");
        }
    }, [wallet, launchData, check_join_update, check_launch_update]);

    let win_prob = 0;

    //if (join_data === null) {
    //    console.log("no joiner info");
    // }

    if (launchData !== null && launchData.tickets_sold > launchData.tickets_claimed) {
        //console.log("joiner", bignum_to_num(join_data.game_id), bignum_to_num(launchData.game_id));
        win_prob = (launchData.num_mints - launchData.mints_won) / (launchData.tickets_sold - launchData.tickets_claimed);
    }

    const fetchLaunchData = useCallback(async () => {
        if (!checkLaunchData.current) return;
        if (pageName === undefined || pageName === null) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        let new_launch_data: [LaunchData | null, number] = [launchData, 0];

        if (launchData === null) {
            try {
                let page_name = pageName ? pageName : "";
                let launch_data_account = PublicKey.findProgramAddressSync(
                    [Buffer.from(page_name.toString()), Buffer.from("Launch")],
                    PROGRAM,
                )[0];

                const launch_account_data = await request_raw_account_data("", launch_data_account);

                new_launch_data = LaunchData.struct.deserialize(launch_account_data);

                //console.log(new_launch_data);

                setLaunchData(new_launch_data[0]);
            } catch (error) {
                console.error("Error fetching launch data:", error);
            }
        }

        
        if (wallet === null || wallet.publicKey === null) {
            setIsLoading(false);
            return;
        }

        const game_id = new myU64(new_launch_data[0]?.game_id);
        const [game_id_buf] = myU64.struct.serialize(game_id);

        let user_join_account = PublicKey.findProgramAddressSync(
            [wallet.publicKey.toBytes(), game_id_buf, Buffer.from("Joiner")],
            PROGRAM,
        )[0];

        if (join_data === null) {
            //console.log("check join data")
            try {
                const join_account_data = await request_raw_account_data("", user_join_account);

                if (join_account_data === null) {
                    setIsLoading(false);
                    checkLaunchData.current = false;
                    return;
                }

                const [new_join_data] = JoinData.struct.deserialize(join_account_data);

                console.log(new_join_data);

                setJoinData(new_join_data);
            } catch (error) {
                console.error("Error fetching join data:", error);
                setIsLoading(false);
                checkLaunchData.current = false;
            }
        }
        checkLaunchData.current = false;
        setIsLoading(false);
    }, [wallet, pageName, launchData, join_data]);

    useEffect(() => {
        if (mintData !== null && launchData !== null) {
            for (let i = 0; i < launchData.plugins.length; i++) {
                if (launchData.plugins[i]["__kind"] === "Whitelist") {
                    let whitelist_mint : PublicKey = launchData.plugins[i]["key"];
                    console.log("have whitelist ", whitelist_mint.toString())
                    setWhitelist(mintData.get(whitelist_mint.toString()))
                    
                }
            }
        }
    }, [mintData, launchData]);

    useEffect(() => {
        checkLaunchData.current = true;
    }, [wallet]);

    useEffect(() => {
        fetchLaunchData();
    }, [fetchLaunchData, pageName]);

    useEffect(() => {
        if (launchData) {
            setTicketPrice(bignum_to_num(launchData.ticket_price) / LAMPORTS_PER_SOL);
        }
    }, [launchData]);

    useEffect(() => {
        if (launchData) {
            setTotalCost(value * ticketPrice);
        }
    }, [value, ticketPrice, launchData]);

    useEffect(() => {
        if (launchData) {
            setCookState(cook_state);
        }
    }, [cook_state, launchData]);

    //console.log(launchData);

    if (!pageName) return;

    if (isLoading || launchData === null) return <Loader />;

    if (!launchData) return <PageNotFound />;

    let one_mint = (bignum_to_num(launchData.total_supply) * (launchData.distribution[0] / 100)) / launchData.num_mints;
    let one_mint_frac = (100 * one_mint) / bignum_to_num(launchData.total_supply);

    const ACTIVE = [CookState.ACTIVE_NO_TICKETS, CookState.ACTIVE_TICKETS].includes(cookState);
    const MINTED_OUT = [
        CookState.MINT_SUCCEEDED_NO_TICKETS,
        CookState.MINT_SUCCEDED_TICKETS_TO_CHECK,
        CookState.MINT_SUCCEEDED_TICKETS_CHECKED_NO_LP,
        CookState.MINT_SUCCEEDED_TICKETS_CHECKED_LP,
        CookState.MINT_SUCCEEDED_TICKETS_CHECKED_LP_TIMEOUT,
    ].includes(cookState);
    const MINT_FAILED = [CookState.MINT_FAILED_NOT_REFUNDED, CookState.MINT_FAILED_REFUNDED].includes(cookState);

    const ticketLabel = (join_data !== null ? join_data.num_tickets : 0) <= 1 ? "ticket" : "tickets";

    return (
        <>
            <Head>
                <title>Let&apos;s Cook | {launchData.page_name}</title>
            </Head>
            <main style={{ background: "linear-gradient(180deg, #292929 10%, #0B0B0B 100%)" }}>
                <FeaturedBanner featuredLaunch={launchData} isHomePage={false} />
                <Center>
                    <VStack spacing={5} my={3} px={5} width={md ? "100%" : "80%"}>
                        <Timespan launchData={launchData} />

                        <VStack
                            gap={50}
                            p={md ? 25 : 50}
                            bg="rgba(255, 255, 255, 0.20)"
                            borderRadius={12}
                            border="1px solid white"
                            h="fit-content"
                            w={lg ? "100%" : "980px"}
                            style={{ maxWidth: lg ? "100%" : "980px" }}
                        >
                            <Flex w="100%" gap={xs ? 50 : lg ? 45 : 75} justify="space-between" direction={md ? "column" : "row"}>
                                <VStack align={md ? "center" : "start"} gap={xs ? 3 : 5}>
                                    <HStack>
                                        <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                            Price per ticket: {bignum_to_num(launchData.ticket_price) / LAMPORTS_PER_SOL}
                                        </Text>
                                        <Image src="/images/sol.png" width={30} height={30} alt="SOL Icon" style={{ marginLeft: -3 }} />
                                    </HStack>

                                    <Text
                                        m="0"
                                        color="white"
                                        fontSize="x-large"
                                        fontFamily="ReemKufiRegular"
                                        align={md ? "center" : "start"}
                                    >
                                        Tickets Sold: {launchData.tickets_sold}
                                    </Text>

                                    <Text
                                        m="0"
                                        color="white"
                                        fontSize="x-large"
                                        fontFamily="ReemKufiRegular"
                                        align={md ? "center" : "start"}
                                    >
                                        Total Winning Tickets: {launchData.num_mints.toLocaleString()}
                                    </Text>

                                    <Text
                                        m="0"
                                        color="white"
                                        fontSize="x-large"
                                        fontFamily="ReemKufiRegular"
                                        align={md ? "center" : "start"}
                                    >
                                        Tokens Per Winning Ticket: {one_mint.toLocaleString()}
                                        <br />({one_mint_frac.toFixed(4)}% of total supply)
                                    </Text>

                                    <HStack align="center" gap={3}>
                                        <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                            Insurance:
                                        </Text>
                                        <Checkbox size="lg" isChecked colorScheme="green" />
                                        <Tooltip
                                            label="You will get a refund for any losing tickets or if the cook fails to reach the Guaranteed Liquidity."
                                            hasArrow
                                            w={300}
                                            fontSize="large"
                                            offset={[0, 10]}
                                        >
                                            <Image width={25} height={25} src="/images/help.png" alt="Help" />
                                        </Tooltip>
                                    </HStack>
                                </VStack>

                                <VStack align="center" justify="center" gap={3}>
                                    <HStack>
                                        <Text
                                            m="0"
                                            color="white"
                                            className="font-face-kg"
                                            textAlign={"center"}
                                            fontSize={lg ? "x-large" : "xxx-large"}
                                        >
                                            {cookState === CookState.PRE_LAUNCH
                                                ? "Warming Up"
                                                : ACTIVE
                                                  ? `Total: ${totalCost.toFixed(2)}`
                                                  : MINTED_OUT
                                                    ? "Cook Out!"
                                                    : MINT_FAILED
                                                      ? "Cook Failed"
                                                      : "none"}
                                        </Text>
                                        {ACTIVE && <Image src="/images/sol.png" width={40} height={40} alt="SOL Icon" />}
                                    </HStack>

                                    <Box
                                        mt={-3}
                                        onClick={() => {
                                            console.log(wallet.publicKey);
                                            if (wallet.publicKey === null) {
                                                handleConnectWallet();
                                            } else {
                                                if (cook_state === CookState.MINT_SUCCEDED_TICKETS_TO_CHECK) {
                                                    //InitAMM();
                                                    if (!isCheckingTickets) {
                                                        CheckTickets();
                                                    }
                                                } else if (ButtonString(cook_state, join_data, launchData) === "Waiting for LP") {
                                                    return;
                                                } else if (
                                                    (cook_state === CookState.MINT_SUCCEEDED_TICKETS_CHECKED_NO_LP &&
                                                        join_data?.ticket_status === 0) ||
                                                    cook_state === CookState.MINT_SUCCEEDED_TICKETS_CHECKED_LP
                                                ) {
                                                    if (!isClamingTokens) {
                                                        ClaimTokens();
                                                    }
                                                } else if (
                                                    cook_state === CookState.MINT_FAILED_NOT_REFUNDED ||
                                                    CookState.MINT_SUCCEEDED_TICKETS_CHECKED_LP_TIMEOUT
                                                ) {
                                                    if (!isRefundingTickets) {
                                                        RefundTickets();
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        {(MINTED_OUT || MINT_FAILED) && (
                                            <VStack>
                                                {cookState === CookState.MINT_FAILED_REFUNDED ||
                                                cookState === CookState.MINT_SUCCEEDED_NO_TICKETS ? (
                                                    <></>
                                                ) : (
                                                    <Box mt={4}>
                                                        <WoodenButton
                                                            isLoading={isCheckingTickets || isClamingTokens || isRefundingTickets}
                                                            label={ButtonString(cook_state, join_data, launchData)}
                                                            size={28}
                                                        />
                                                    </Box>
                                                )}

                                                {MINTED_OUT &&
                                                    join_data !== null &&
                                                    join_data.num_tickets > join_data.num_claimed_tickets && (
                                                        <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                                            {(100 * win_prob).toFixed(3)}% chance per ticket
                                                        </Text>
                                                    )}
                                            </VStack>
                                        )}
                                    </Box>

                                    <HStack maxW="320px" hidden={MINTED_OUT || MINT_FAILED}>
                                        <Button {...dec} size="lg" isDisabled={cookState === CookState.PRE_LAUNCH}>
                                            -
                                        </Button>

                                        <Input
                                            {...input}
                                            size="lg"
                                            fontSize="x-large"
                                            color="white"
                                            alignItems="center"
                                            justifyContent="center"
                                            isDisabled={cookState === CookState.PRE_LAUNCH}
                                        />
                                        <Button {...inc} size="lg" isDisabled={cookState === CookState.PRE_LAUNCH}>
                                            +
                                        </Button>
                                    </HStack>

                                    <Button
                                        size="lg"
                                        isDisabled={cookState === CookState.PRE_LAUNCH}
                                        hidden={MINTED_OUT || MINT_FAILED}
                                        onClick={() => {
                                            wallet.publicKey === null ? handleConnectWallet() : openWarning();
                                        }}
                                    >
                                        {wallet.publicKey === null ? "Connect Wallet" : "Buy Tickets"}
                                    </Button>

                                    {!(cookState === CookState.PRE_LAUNCH) ? (
                                        <VStack hidden={MINTED_OUT || MINT_FAILED}>
                                            <HStack alignItems="center">
                                                <Text m="0" color="white" fontSize="large" fontFamily="ReemKufiRegular">
                                                    Platform fee: 0.01
                                                </Text>
                                                <Image
                                                    src="/images/sol.png"
                                                    width={20}
                                                    height={20}
                                                    alt="SOL Icon"
                                                    style={{ marginLeft: -3 }}
                                                />
                                            </HStack>
                                            {whitelist !== null &&
                                                <HStack alignItems="center">
                                                    <Text m="0" color="white" fontSize="large" fontFamily="ReemKufiRegular">
                                                        Whitelist Required
                                                    </Text>
                                                    <Link
                                                        href={getSolscanLink(whitelist.mint.address, "Token")}
                                                        target="_blank"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                    <Image
                                                        src={whitelist.icon}
                                                        width={20}
                                                        height={20}
                                                        alt="SOL Icon"
                                                        style={{ marginLeft: -3 }}
                                                    />
                                                    </Link>
                                                </HStack>
                                            }
                                        </VStack>
                                    ) : (
                                        <Text m="0" color="white" fontSize="large" fontFamily="ReemKufiRegular">
                                            Tickets are not yet available for purchase.
                                        </Text>
                                    )}
                                </VStack>
                            </Flex>

                            <VStack w={xs ? "100%" : "85%"}>
                                <Flex direction={md ? "column" : "row"}>
                                    <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                        Guaranteed Liquidity:
                                    </Text>
                                    <HStack justify="center">
                                        <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                            &nbsp;
                                            {(Math.min(launchData.num_mints, launchData.tickets_sold) * launchData.ticket_price) /
                                                LAMPORTS_PER_SOL}{" "}
                                            of {(launchData.num_mints * launchData.ticket_price) / LAMPORTS_PER_SOL}
                                        </Text>
                                        <Image src="/images/sol.png" width={30} height={30} alt="SOL Icon" style={{ marginLeft: -3 }} />
                                    </HStack>
                                </Flex>

                                <Progress
                                    hasStripe={MINTED_OUT}
                                    mb={3}
                                    w="100%"
                                    h={25}
                                    borderRadius={12}
                                    colorScheme={
                                        cookState === CookState.PRE_LAUNCH
                                            ? "none"
                                            : ACTIVE
                                              ? "whatsapp"
                                              : MINTED_OUT
                                                ? "linkedin"
                                                : MINT_FAILED
                                                  ? "red"
                                                  : "none"
                                    }
                                    size="sm"
                                    max={(launchData.num_mints * launchData.ticket_price) / LAMPORTS_PER_SOL}
                                    min={0}
                                    value={
                                        (Math.min(launchData.num_mints, launchData.tickets_sold) * launchData.ticket_price) /
                                        LAMPORTS_PER_SOL
                                    }
                                    boxShadow="0px 5px 15px 0px rgba(0,0,0,0.6) inset"
                                />
                                {(join_data === null || join_data.num_claimed_tickets === 0) && (
                                    <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                        You own {join_data !== null ? join_data.num_tickets : 0} {ticketLabel}{" "}
                                        {join_data !== null && join_data.num_claimed_tickets < join_data.num_tickets
                                            ? "(" + (join_data.num_tickets - join_data.num_claimed_tickets) + " to check)"
                                            : ""}
                                    </Text>
                                )}
                                {join_data !== null && join_data.num_claimed_tickets > 0 && (
                                    <Text m="0" color="white" fontSize="x-large" fontFamily="ReemKufiRegular">
                                        You Have {join_data.num_winning_tickets} Winning Tickets{" "}
                                        {join_data !== null && join_data.num_claimed_tickets < join_data.num_tickets
                                            ? "(" + (join_data.num_tickets - join_data.num_claimed_tickets) + " to check)"
                                            : ""}
                                    </Text>
                                )}
                            </VStack>
                        </VStack>

                        <TokenDistribution launchData={launchData} />
                    </VStack>
                </Center>
                <WarningModal
                    launchData={launchData}
                    value={value}
                    isWarningOpened={isWarningOpened}
                    closeWarning={closeWarning}
                    BuyTickets={BuyTickets}
                />
            </main>
        </>
    );
};

export default TokenMintPage;
