import { ChakraProvider } from "@chakra-ui/react";
import { WalletProvider, ConnectionProvider } from "@solana/wallet-adapter-react";
import { type ConnectionConfig } from "@solana/web3.js";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Config } from "../components/Solana/constants";
import { theme } from "../chakra";
import { useEffect, useMemo } from "react";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";
import NoSSR from "../utils/NoSSR";
import ContextProviders from "./_contexts";
import { ToastContainer } from "react-toastify";
import NextTopLoader from "nextjs-toploader";
import "bootstrap/dist/css/bootstrap.css";
import "react-toastify/dist/ReactToastify.css";
import "../styles/fonts.css";
import "../styles/table.css";
import { usePathname } from "next/navigation";
import useResponsive from "../hooks/useResponsive";

function MyApp({ Component, pageProps }) {
    const { sm } = useResponsive();
    const pathname = usePathname();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const hide = ["/curated/pepemon"];

    const wallets = useMemo(() => [], []);

    const connectionConfig: ConnectionConfig = { wsEndpoint: Config.WSS_NODE, commitment: "confirmed" };

    return (
        <NoSSR>
            <ToastContainer
                position="bottom-right"
                autoClose={4000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                pauseOnFocusLoss={false}
                pauseOnHover={false}
                rtl={false}
                draggable
                theme="light"
            />
            <ChakraProvider theme={theme}>
                <NextTopLoader />
                <ConnectionProvider endpoint={Config.RPC_NODE} config={connectionConfig}>
                    <WalletProvider wallets={wallets} autoConnect>
                        <WalletModalProvider>
                            <ContextProviders>
                                {!hide.includes(pathname) && <Navigation />}
                                <div style={{ minHeight: "calc(100vh - 47.5px)", paddingTop: !hide.includes(pathname) && "50px" }}>
                                    <Component {...pageProps} />
                                </div>
                                {hide.includes(pathname) || (!sm && <Footer />)}
                            </ContextProviders>
                        </WalletModalProvider>
                    </WalletProvider>
                </ConnectionProvider>
            </ChakraProvider>
        </NoSSR>
    );
}

export default MyApp;
