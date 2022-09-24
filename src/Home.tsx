import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react';
import * as anchor from '@project-serum/anchor';
import styled from 'styled-components';
import { Container, Snackbar } from '@material-ui/core';
import Paper from '@material-ui/core/Paper';
import Alert from '@material-ui/lab/Alert';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui';
import { Dialog, Transition } from '@headlessui/react';
import {
  awaitTransactionSignatureConfirmation,
  CandyMachineAccount,
  CANDY_MACHINE_PROGRAM,
  getCandyMachineState,
  mintOneToken,
  getNftsForOwner,
  getTokenWallet
} from './candy-machine';
import { sendTransactionWithRetry } from './connection';
import { AlertState } from './utils';
import { Header } from './Header';
import { MintButton } from './MintButton';
import { GatewayProvider } from '@civic/solana-gateway-react';
import * as mt from './metadata'
import { UPDATE_AUTHORITY,AR_SOL_HOLDER_ID, MEMO } from "./constant";
import { calculate } from '@metaplex/arweave-cost';
import { AccountLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import crypto from 'crypto';
import Navbar from './components/Shared/Navbar/Navbar';
import HeaderNew from './components/HeaderNew/HeaderNew';
const ConnectButton = styled(WalletDialogButton)`
  width: 100%;
  height: 60px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: linear-gradient(180deg, #604ae5 0%, #813eee 100%);
  color: white;
  font-size: 16px;
  font-weight: bold;
`;

const confirmOption : anchor.web3.ConfirmOptions = {
    commitment : 'finalized',
    preflightCommitment : 'finalized',
    skipPreflight : false
}

const MintContainer = styled.div``; // add your owns styles here
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
const POOL = new PublicKey("CaahDoBEyGuuiXo7A9m68mtshizMZBXXcd1nb9N9Xcxm")
const programId = new PublicKey("63qdQrAaCUbbgH6KHMpW5UGycDMwA1bBPR7dXhM2m9zA")
const idl = require('./solana_anchor.json')
const endpoint = 'devnet'
// const endpoint = 'mainnet-beta'
let nfts : any[] = []

async function sendTransaction(connection : anchor.web3.Connection,transaction : anchor.web3.Transaction, signers : anchor.web3.Keypair[], wallet: any){
    try{
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (await connection.getRecentBlockhash('max')).blockhash;
        await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
        if(signers.length != 0) await transaction.partialSign(...signers);
        const signedTransaction = await wallet.signTransaction(transaction);
        let hash = await connection.sendRawTransaction(await signedTransaction.serialize());
        await connection.confirmTransaction(hash);
        return 1;
    } catch(err) {
        console.log(err);
        return 0;
    }
}

export async function getAssetCostToStore(files: { size: number }[]) {
  const sizes = files.map(f => f.size);
  const result = await calculate(sizes);

  return anchor.web3.LAMPORTS_PER_SOL * result.solana;
}

interface IArweaveResult {
  error?: string;
  messages?: Array<{
    filename: string;
    status: 'success' | 'fail';
    transactionId?: string;
    error?: string;
  }>;
}

const ARWEAVE_UPLOAD_ENDPOINT =
  'https://us-central1-metaplex-studios.cloudfunctions.net/uploadFile';
const RESERVED_TXN_MANIFEST = 'manifest.json';

const uploadToArweave = async (data: FormData): Promise<IArweaveResult> => {
  const resp = await fetch(
    ARWEAVE_UPLOAD_ENDPOINT,
    {
      method: 'POST',
      // @ts-ignore
      body: data,
    },
  );

  if (!resp.ok) {
    return Promise.reject(
      new Error(
        'Unable to upload the artwork to Arweave. Please wait and then try again.',
      ),
    );
  }

  const result: IArweaveResult = await resp.json();

  if (result.error) {
    return Promise.reject(new Error(result.error));
  }

  return result;
};

export async function updateNftMetadata(
  conn : anchor.web3.Connection,
  wallet : any,
  originData : any,
  newName : string,
  ){
  console.log("+ updateMetadata")
  try{

  let metadataContent = {
    ...originData.offChainData,
    name : newName,
  }
  const instruction: anchor.web3.TransactionInstruction[] = []
  const metadata = originData.offChainData

  const realFiles : File[] = [new File([JSON.stringify(metadataContent)],'metadata.json')]

  let lamports = await getAssetCostToStore(realFiles)
  console.log(lamports)
  instruction.push(
    anchor.web3.SystemProgram.transfer({
      fromPubkey : wallet.publicKey,
      toPubkey : new anchor.web3.PublicKey(AR_SOL_HOLDER_ID),
      lamports : lamports * 20
    })
  )

  const hashSum = crypto.createHash('sha256')
  hashSum.update(await realFiles[0].text())
  const hex = hashSum.digest('hex')

  instruction.push(
    new anchor.web3.TransactionInstruction({
      keys: [],
      programId : new anchor.web3.PublicKey(MEMO),
      data : Buffer.from(hex),
    })
  )

  const mintKey = anchor.web3.Keypair.generate().publicKey.toBase58()
  
  const { txid } = await sendTransactionWithRetry(
    conn,
    wallet,
    instruction,
    [],
    'single',
  );
  await conn.confirmTransaction(txid, 'max');
  await conn.getParsedConfirmedTransaction(txid, 'confirmed');

  const data = new FormData();
  data.append('transaction', txid);
  data.append('env', endpoint);

  const tags = realFiles.reduce(
    (acc: Record<string, Array<{ name: string; value: string }>>, f) => {
      acc[f.name] = [{ name: 'mint', value: mintKey }];
      return acc;
    },
    {},
  );
  console.log(tags)
  data.append('tags', JSON.stringify(tags));
  realFiles.map(f => data.append('file[]', f));

  const result : IArweaveResult = await uploadToArweave(data)
  const metadataFile = result.messages?.find(
    m => m.filename === RESERVED_TXN_MANIFEST,
  );
  console.log(metadataFile)
  const arweaveLink = `https://arweave.net/${(metadataFile as any).transactionId}`;
  console.log(arweaveLink)
  let provider = new anchor.Provider(conn, wallet, confirmOption);
  let program = new anchor.Program(idl,programId, provider);
  let fetchData = await program.account.pool.fetch(POOL);
  let feeReceiverInfo = await conn.getAccountInfo((fetchData as any).feeReceiver!)
  let feeMint = new anchor.web3.PublicKey(AccountLayout.decode(feeReceiverInfo!.data).mint)
  let nftMint = new anchor.web3.PublicKey(originData.mint)
  let feeSender = await getTokenWallet(wallet.publicKey, feeMint)
  let nftAccount = await getTokenWallet(wallet.publicKey,nftMint)
  let transaction = new anchor.web3.Transaction()
  transaction.add(program.instruction.updateMetadata(
    newName,
    arweaveLink,
    {
      accounts : {
        owner : wallet.publicKey,
        pool : POOL,
        nftMint : nftMint,
        nftAccount : nftAccount,
        metadata : originData.address,
        feeSender : feeSender,
        feeReceiver : (fetchData as any).feeReceiver,
        tokenMetadataProgram : METADATA_PROGRAM_ID,
        tokenProgram : TOKEN_PROGRAM_ID,
      }
    }
  ))
  return (await sendTransaction(conn,transaction,[],wallet))
  } catch(e) {
    console.log(e)
    return 0;
  }
}

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  txTimeout: number;
  rpcHost: string;
}

const Home = (props: HomeProps) => {
  const [name,setName] = useState('')
  const [order, setOrder] = useState(-1)
  const [isUserMinting, setIsUserMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: '',
    severity: undefined,
  });
  const [changed, setChange] = useState(true)
  const render = () => {
    setChange(!changed)
  }
  const rpcUrl = props.rpcHost;
  const wallet = useWallet();

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const refreshCandyMachineState = useCallback(async () => {
    if (!anchorWallet) {
      return;
    }

    if (props.candyMachineId) {
      try {
        const cndy = await getCandyMachineState(
          anchorWallet,
          props.candyMachineId,
          props.connection,
        );
        nfts = await getNftsForOwner(props.connection,wallet.publicKey!)
        console.log(nfts)
        setCandyMachine(cndy);
      } catch (e) {
        console.log('There was a problem fetching Candy Machine state');
        console.log(e);
      }
    }
  }, [anchorWallet, props.candyMachineId, props.connection]);

  const onMint = async () => {
    try {
      setIsUserMinting(true);
      document.getElementById('#identity')?.click();
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        const mintTxId = (
          await mintOneToken(candyMachine, wallet.publicKey)
        )[0];

        let status: any = { err: true };
        if (mintTxId) {
          status = await awaitTransactionSignatureConfirmation(
            mintTxId,
            props.txTimeout,
            props.connection,
            true,
          );
        }

        if (status && !status.err) {
          setAlertState({
            open: true,
            message: 'Congratulations! Mint succeeded!',
            severity: 'success',
          });
        } else {
          setAlertState({
            open: true,
            message: 'Mint failed! Please try again!',
            severity: 'error',
          });
        }
      }
    } catch (error: any) {
      let message = error.msg || 'Minting failed! Please try again!';
      if (!error.msg) {
        if (!error.message) {
          message = 'Transaction Timeout! Please try again.';
        } else if (error.message.indexOf('0x137')) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf('0x135')) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          window.location.reload();
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: 'error',
      });
    } finally {
      setIsUserMinting(false);
    }
  };

  useEffect(() => {
    refreshCandyMachineState();
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    refreshCandyMachineState,
  ]);



  return (
  <div>
    <Navbar></Navbar>
    <HeaderNew></HeaderNew>
    <Container style={{ marginTop: 100, marginBottom: 100 }}>
      <Container maxWidth="xs" style={{ position: 'relative' }}>
        <Paper
          style={{ padding: 24, backgroundColor: '#151A1F', borderRadius: 6 }}
        >
          {!wallet.connected ? (
            <ConnectButton>Connect Wallet</ConnectButton>
          ) : (
            <>
              <Header candyMachine={candyMachine} />
              <MintContainer>
                {candyMachine?.state.isActive &&
                candyMachine?.state.gatekeeper &&
                wallet.publicKey &&
                wallet.signTransaction ? (
                  <GatewayProvider
                    wallet={{
                      publicKey:
                        wallet.publicKey ||
                        new PublicKey(CANDY_MACHINE_PROGRAM),
                      //@ts-ignore
                      signTransaction: wallet.signTransaction,
                    }}
                    gatekeeperNetwork={
                      candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                    }
                    clusterUrl={rpcUrl}
                    options={{ autoShowModal: false }}
                  >
                    <MintButton
                      candyMachine={candyMachine}
                      isMinting={isUserMinting}
                      onMint={onMint}
                    />
                  </GatewayProvider>
                ) : (
                  <MintButton
                    candyMachine={candyMachine}
                    isMinting={isUserMinting}
                    onMint={onMint}
                  />
                )}
              </MintContainer>
            </>
          )}          
        </Paper>
      </Container>
      <div className="row">
        {nfts.map((nft,idx)=>{
          return <div key={idx} className="card md-3" style={{"width" : "250px"}} onClick={()=>{
            setName(nft.metadata.name)
            setOrder(idx)
          }}>
            <img className="card-img-top" src={nft.offChainData.image} alt="Image Error"/>
            <div className="card-img-overlay">
              <h4>{nft.metadata.name}</h4>
            </div>
          </div>
        })}
      </div>
      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
      <div className="row m-3">
        <div className="input-group">
          <div className="input-group-prepend">
            {/* <span className="input-group-text">Name</span> */}
          </div>
          {/* <input type="text" className="form-control" onChange={(event)=>{setName(event.target.value)}} value={name}/> */}
          {
            order != -1 &&
              <button type="button" className="btn btn-success" onClick={async () =>{
                if(await updateNftMetadata(props.connection,wallet,nfts[order],name)){
                  setAlertState({
                    open: true,
                    message: 'Congratulations! Update succeeded!',
                    severity: 'success',
                  });
                }else{
                  setAlertState({
                    open: true,
                    message: 'Update failed! Please try again!',
                    severity: 'error',
                  });
                }
                nfts = await getNftsForOwner(props.connection,wallet.publicKey!)
                render()
              }}>Update</button>
          }
        </div>
      </div>
    </Container>
  </div>
  );
};

export default Home;
