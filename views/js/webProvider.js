const vscode = require('vscode');
const fs = require('fs');
const axios = require('axios');
const qrcode = require('qrcode');
const uglifyJS = require("uglify-js");

const util = require('../../util');

const crypto = require('crypto')
// @ts-ignore
global["crypto"] = crypto;

const cUtils = util.dynamicRequire("@cmdcode/crypto-utils");
const tapScript = util.dynamicRequire("@cmdcode/tapscript");


const {
	BRC20pm
} = require("./brc20pm")

const ec = new TextEncoder();

const NodeMap = {
	local: "http://127.0.0.1:8765/api",
	testnet: "http://test-node.brc20pm.com:8763/api",
	mainnet: "http://main-node.brc20pm.com:8761/api"
}




function getTargetAddr() {
	let address;
	switch (BRC20pmNode_Url) {
		case NodeMap.mainnet:
			address = "3LAoUiU2X2cKRURL3hTHMufHM15Xrk2K9s"
			break;
		case NodeMap.testnet:
			address = "2N4vkrW97TmqdtdkHvMpfuRMqJF17CSvbFC"
			break;
	}
	return address;
}


let BRC20pmNode_Url = "http://127.0.0.1:8765/api"



//本地测试账户
let account = "2N7TYrDKNeZf4eVGXDVJyRKWaPdbx4qvCJj"

//选中的文件路径
let selectFilePath = null;

//订阅的交易
var subTxMap = {};

// 创建axios实例
const service = axios.create({
	timeout: 6000,
});


//视图层
let Provider = null

class WebViewProvider {


	/**
	 * @param {any} context
	 */
	constructor(context) {
		this.context = context
		this.viewType = 'webView';
	}




	resolveWebviewView(webviewView, context) {
		//注入webView
		this.webviewView = webviewView;
		//开启配置
		this.webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			// retainContextWhenHidden: true, // webview被隐藏时保持状态，避免被重置
			// localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
		};
		//监听webView发来的消息
		this.webviewView.webview.onDidReceiveMessage(( /** @type {any} */ message) => {
			this.switchMessage(message);
			//执行命令 
			// vscode.commands.executeCommand("BRC20pm.helloWorld")
		}, null, context.subscriptions);


		//注入页面内容
		this.webviewView.webview.html = getWebViewContent(this.context, '/views/html/index.html');

		//赋值视图层
		Provider = this.webviewView.webview

	}

	//获取可编译文件并发送
	getPorjectFiles() {
		let files = getPorjectFiles();
		callWebView({
			cmd: 'get-work-file-result',
			data: files
		});
	}

	//处理消息
	/**
	 * @param {{ cmd: any; data: any; }} message
	 */
	async switchMessage(message) {
		switch (message.cmd) {
			case "get-work-file":
				this.getPorjectFiles();
				break;
			case "compile":
				compile_msg(message)
				break;
			case "deploy":
				deploy_msg(message)
				break;
			case "exec":
				exec_msg(message)
				break;
			case "pay-ok":
				payOk_msg(message)
				break;
			case "get-contract":
				getContract_msg(message)
				break;
			case "change-net":
				changenet_msg(message)
				break;
			case "node-net":
				BRC20pmNode_Url = NodeMap[message.data]
				if (message.data != "local") {
					subTransactions()
				}
				break;
			case "change-account":
				account_msg(message)
				break;
			case "log":
				util.log(message.data)
				break;
			case "show-error":
				util.showError(message.data);
				break;
			case "show-info":
				util.showInfo(message.data);
				break;
		}
	}

} 6


async function subTransactions() {
	//订阅该交易 
	BRC20pm.subscribe(BRC20pmNode_Url + "/subscribe", "block", async function (result, error) {
		if (error) {
			util.log("error:", error.toString())
			return
		}
		result.transactions.forEach(async txid => {
			if (subTxMap[txid]) {
				let response = await get(BRC20pmNode_Url + "/tx/" + txid)
				if (response) {
					let result = response.data.data
					if (result) {
						let transaction = result
						switch (transaction.op) {
							case "send":
								callWebView({
									cmd: 'send-result',
									data: transaction
								});
								break;
							case "deploy":
								//如果部署成功获取合约信息返回
								// @ts-ignore
								if (transaction.status === 1) {
									// @ts-ignore
									let cObjd = await getContract(transaction.kid);
									callWebView({
										cmd: 'deploy-result',
										data: {
											tx: transaction,
											cObjd
										}
									});
								} else {
									//部署失败只返回交易
									callWebView({
										cmd: 'send-result',
										data: transaction
									});
								}
								break;
						}
						//处理完毕删除掉
						// @ts-ignore
						delete subTxMap[transaction.tx_hash]
						//打印一下交易日志
						util.log(transaction)
					}
				}
			}
		})
	})

}



/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function compile_msg(message) {
	let file = message.data;
	if (file) {
		let cResult = codeCompile(file.path);
		if (cResult) {
			selectFilePath = file.path;
			util.showInfo("Compile: " + file.name)
			callWebView({
				cmd: 'compile-result',
				data: true
			});
		}
	} else {
		util.showError("No file selected")
	}
}


/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function deploy_msg(message) {
	let callData = message.data;
	let hash = await deploy(callData);
	if (hash) {
		//注意这里获取交易是本地测试环境,测试网和正式网都通过事件订阅callBack给视图层
		let result = await getTx(hash);
		let tx = result;
		if (!tx) {
			return
		}
		if (tx.status === 1) {
			let cObjd = await getContract(tx.kid);
			callWebView({
				cmd: 'deploy-result',
				data: {
					tx,
					cObjd
				}
			});
		} else {
			callWebView({
				cmd: 'send-result',
				data: tx
			});
		}
		util.log(tx)
	}
}


/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function exec_msg(message) {
	let exec = message.data;
	if (exec.isView) {
		//读取
		let result = await call(exec)
		util.log(result)
	} else {
		//写入
		let hash = await send(exec);
		if (hash) {
			//注意这里获取交易是本地测试环境,测试网和正式网都通过事件订阅callBack给视图层
			let result = await getTx(hash);
			let tx = result;
			if (!tx) {
				return
			}
			callWebView({
				cmd: 'send-result',
				data: tx
			});
			util.log(tx)
		}
	}
}


/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function payOk_msg(message) {
	let payWith = message.data
	//支付完成
	let txHash = await sendTx(payWith)
	if (txHash) {
		let op = payWith.relayer.op
		//构建订阅信息
		let subObj = {
			hash: txHash,
			op: op
		}
		//因为是订阅所以不需要同步
		getTx(txHash, subObj);
	}
}


/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function getContract_msg(message) {
	let kid = message.data;
	if (!kid.startsWith("ord")) {
		util.showError("invalid address")
		return
	}
	let cObjg = await getContract(kid);
	callWebView({
		cmd: 'get-contract-result',
		data: cObjg
	});
}


/**
 * @param {{ cmd?: any; data: any; }} message
 */
async function changenet_msg(message) {
	if (message) {

		// util.log(message)
		let nodenet = message.data;

		BRC20pmNode_Url = NodeMap[nodenet]

		//因为切换网络,所以需要取消所有
		BRC20pm.clearSubscriptions()

		let frees = await getFeeRate(nodenet)
		callWebView({
			cmd: 'change-net-result',
			data: frees
		});
		util.log("frees", frees)
	}

}

//设置测试账户
/**
 * @param {{ cmd?: any; data: any; }} message
 */
function account_msg(message) {
	let address = message.data;
	account = address;
}

//部署合约
/**
 * @param {{ [x: string]: any; vm: any; rate: any; }} callData
 */
async function deploy(callData) {
	let rVM = callData.vm;
	let rate = callData.rate;
	let out = callData.out;

	let cScript = await getFileContent(selectFilePath);

	//先将合约格式化压缩
	let code = codeMinify(cScript)

	switch (rVM.nodenet) {
		case "local":
			//再转为16进制字符串
			let hex = str2Hex(code)
			let data = {
				sender: account,
				operation: "deploy",
				source: hex
			}
			return delpoyLocal(data);
		default:
			buildTx("deploy", code, rVM, rate, out)
			break;
	}
}

/**
 * @param {{ sender: string; operation: string; source: string; }} data
 */
async function delpoyLocal(data) {
	let response = await post(BRC20pmNode_Url + "/indexer", data);
	if (response) {
		let result = response.data
		if (result.code === 200) {
			return result.data
		} else {
			util.showError(`error: ${result.msg}`)
		}
	}
}

//获取交易详情
async function getTx(hash, subObj = null) {
	if (subObj) {
		//关闭模态窗
		hiddenModal()
		util.log("Tx Hash:", hash, "Under confirmation...")
		//添加交易Hash到订阅列表
		subTxMap[subObj.hash] = subObj.op //订阅该交易
	} else {
		let response = await get(BRC20pmNode_Url + "/tx/" + hash)
		if (response) {
			let result = response.data.data
			if (result) {
				let tx = result
				if (tx.status === 1) {
					util.showInfo('success')
				} else {
					util.showError(`${tx.out}`)
				}
				return tx
			}
		}
	}

}

//获取合约
/**
 * @param {string} kid
 */
async function getContract(kid) {
	let response = await get(BRC20pmNode_Url + "/script/" + kid)
	if (response) {
		let result = response.data
		if (result.code === 200) {
			return result.data
		} else {
			util.showError(`${result.msg}`)
		}
	}

	return null;
}



//写入合约
/**
 * @param {{ [x: string]: any; vm: any; rate: any; }} callData
 */
function send(callData) {
	let rVm = callData.vm;
	let rate = callData.rate;
	let out = callData.out;

	delete callData["out"];
	delete callData["vm"];
	delete callData["isView"];
	delete callData["rate"]

	let paramPass = true

	if (callData.params) {
		callData.params.forEach(arg => {
			if (!arg) {
				paramPass = false
				return
			}
		})
	}

	if (!paramPass) {
		util.showError('invalid param')
		return
	}


	//本地测试环境
	let arg = JSON.stringify(callData);

	switch (rVm.nodenet) {
		case "local":
			let data = {
				sender: account,
				operation: "send",
				source: str2Hex(arg)
			}
			return sendLocal(data);
		default:
			//测试网或正式网
			buildTx("send", arg, rVm, rate, out)
			break;
	}
}


/**
 * @param {{ sender: string; operation: string; source: string; }} data
 */
async function sendLocal(data) {
	let response = await post(BRC20pmNode_Url + "/indexer", data);
	if (response) {
		let result = response.data
		if (result.code === 200) {
			return result.data
		} else {
			util.showError(`error: ${result.msg}`)
		}
	}
}


//读取合约
/**
 * @param {{ [x: string]: any; vm: any; }} callData
 */
async function call(callData) {
	delete callData["vm"];
	delete callData["isView"];
	delete callData["rate"]

	let paramPass = true;
	if (callData.params) {
		callData.params.forEach(arg => {
			if (!arg) {
				paramPass = false
				return
			}
		})
	}

	if (!paramPass) {
		util.showError('invalid param')
		return
	}


	let arg = JSON.stringify(callData);
	//再转为16进制字符串
	let hex = str2Hex(arg)
	//构建数据
	let data = {
		sender: account,
		source: hex
	}

	let response = await post(BRC20pmNode_Url + "/call", data);
	if (response) {
		let result = response.data
		if (result.code == 200) {
			return result.data
		} else {
			util.showError(`error: ${result.msg}`)
		}
	}
}




//获取费率
/**
 * @param {any} nodenet
 */
async function getFeeRate(nodenet) {
	let response = null;
	switch (nodenet) {
		case "testnet":
			try {
				response = await get("https://mempool.space/testnet/api/v1/fees/recommended");
			} catch (e) {
				util.showError(e)
			}
			break;
		case "mainnet":
			try {
				response = await get("https://mempool.space/api/v1/fees/recommended");
			} catch (e) {
				util.showError(e)
			}
			break;
		case "local":
			return {
				fastestFee: 1,
				halfHourFee: 1,
				hourFee: 1,
				economyFee: 1,
				minimumFee: 1
			};
	}

	let fees = response.data;
	return fees;
}


/**
 * @param {string} address
 * 获取地址最新的接收交易
 */
async function getLastVout(address) {
	let lastVoutTx = null
	let url = "https://mempool.space/testnet/api/address/" + address + "/txs"
	util.log(url)
	let response = await get(url);
	if (response) {
		let txList = response.data
		if (txList) {
			for (let i = 0; i < txList.length; i++) {
				const tx = txList[i];
				for (let index = 0; index < tx.vout.length; index++) {
					const output = tx.vout[index];
					if (output["scriptpubkey_address"] == address) {
						lastVoutTx = {
							txid: tx["txid"],
							vout: index,
							amount: output["value"]
						}
						break; // 找到符合条件的输出后退出循环
					}
				}
				if (lastVoutTx) { // 如果找到了，提前退出外部循环
					break;
				}
			}
		}
	}

	return lastVoutTx;
}



//构建交易(操作标识符,wit数据,网络信息)

async function buildTx(op, source, vm, rate, out) {
	// // Create a keypair to use for testing.
	const secret = cUtils.util.random(32).hex;
	const seckey = cUtils.keys.get_seckey(secret)
	const pubkey = cUtils.keys.get_pubkey(seckey, true)
	//构建中继者需要的数据
	let relay = {
		pubkey,
		op,
		source,
		vm,
		rate
	}

	//如果有输出
	if (out) {
		relay['out'] = out;
	}

	//生成中继者
	let relayer = gen_relayer(relay)
	//带上操作识别码
	relayer.op = op
	//带上私钥
	relayer.secret = secret;


	//生成pay信息
	let btcValue = getBtcValue(relayer.fee + 2000)
	let address = relayer.address


	util.log('Relayer address:', address, 'Tx fee:', btcValue + " BTC")

	const payWith = await genPayWith(address, btcValue, vm.nodenet)
	payWith['relayer'] = relayer
	//发送给视图层
	callWebView({
		cmd: "pay-with",
		data: payWith
	})
}

//生成地址
function gen_relayer(relay) {

	//协议标识符
	const marker = ec.encode('ord')
	const mimetype = ec.encode('text/plain;charset=utf-8')

	const brc20JSON = {
		"p": "brc-20",
		"op": relay.op,
		"src": textToHex(relay.source)
	}
	

	// Basic format of an 'inscription' script.
	const script = [relay.pubkey, 'OP_CHECKSIG', 'OP_0', 'OP_IF', marker, '01', mimetype, 'OP_0', ec.encode(JSON.stringify(brc20JSON)),
		'OP_ENDIF'
	]
	// For tapscript spends, we need to convert this script into a 'tapleaf'.
	const tapleaf = tapScript.Tap.encodeScript(script)
	// Generate a tapkey that includes our leaf script. Also, create a merlke proof 
	// (cblock) that targets our leaf and proves its inclusion in the tapkey.
	const [tpubkey, cblock] = tapScript.Tap.getPubKey(relay.pubkey, {
		target: tapleaf
	})
	// A taproot address is simply the tweaked public key, encoded in bech32 format.

	// A taproot address is simply the tweaked public key, encoded in bech32 format.
	const address = tapScript.Address.p2tr.fromPubKey(tpubkey, relay.vm.nodenet)



	const scriptHex = tapScript.Script.encode(script, false).hex

	let vout = relay.out;
	if (relay.out.address) {
		vout.value = parseInt(vout.value);
		if (Number.isNaN(vout.value)) {
			vout.value = parseInt('0')
		}
	} else {
		vout.value = parseInt('0');
	}

	const txsize = 200 + (relay.source.length / 2);
	const fee = Math.round(relay.rate * txsize) + (vout.value + 1);

	//返回信息
	return {
		script: scriptHex,
		tapleaf,
		tpubkey,
		cblock,
		address,
		vout,
		fee
	}
}

function textToHex(text) {
	var encoder = ec.encode(text);
	return [...new Uint8Array(encoder)]
		.map(x => x.toString(16).padStart(2, "0"))
		.join("");
}

//发送完成准备构建交易广播出去
/**
 * @param {{ address: string; relayer: any; }} payWith
 */
async function sendTx(payWith) {
	let voutTx = await getLastVout(payWith.address)
	if (voutTx) {
		let relayer = payWith.relayer
		relayer['voutTx'] = voutTx
		if (voutTx.amount >= relayer.fee) {
			//关闭窗口
			callWebView({
				cmd: "hidden-modal",
				data: ""
			})

			let txHex = await gen_txdata(relayer)

			util.log("trDigest", txHex)

			let txHash = await broadcast_tx(txHex)
			return txHash;
		} else {
			let btcValue = getBtcValue(relayer.fee)
			util.log("Gas fee is invalid, please pay again:" + btcValue + "BTC")
		}
	} else {
		util.log("No valid transaction found")
	}
}

//构建交易
async function gen_txdata(relayer) {
	const seckey = cUtils.keys.get_seckey(relayer.secret)
	const pubkey = cUtils.keys.get_pubkey(seckey, true)
	const script = tapScript.Script.decode(relayer.script)

	let vout = [{
		// We are leaving behind 1000 sats as a fee to the miners.
		value: relayer.voutTx.amount - relayer.fee,
		// This is the new script that we are locking our funds to.
		scriptPubKey: tapScript.Address.toScriptPubKey(getTargetAddr())
	}]


	if (relayer.vout.value) {
		vout.push({
			value: relayer.vout.value,
			scriptPubKey: tapScript.Address.toScriptPubKey(relayer.vout.address)
		})
	}

	const tx_data = await tapScript.Tx.create({
		version: 2,
		vin: [{
			// Use the txid of the funding transaction used to send the sats.
			txid: relayer.voutTx.txid,
			// Specify the index value of the output that you are going to spend from.
			vout: relayer.voutTx.vout,
			// Also include the value and script of that ouput.
			prevout: {
				// Feel free to change this if you sent a different amount.
				value: relayer.voutTx.amount,
				// This is what our address looks like in script form.
				scriptPubKey: tapScript.Address.toScriptPubKey(relayer.address)
			},
			witness: []
		}],
		vout: vout
	})

	// For this example, we are signing for input 0 of our transaction,
	// using the untweaked secret key. We are also extending the signature 
	// to include a commitment to the tapleaf script that we wish to use.
	const sig = await tapScript.Signer.taproot.sign(seckey, tx_data, 0, {
		extension: relayer.tapleaf
	})

	// Add the signature to our witness data for input 0, along with the script
	// and merkle proof (cblock) for the script.
	tx_data.vin[0].witness = [sig, script, relayer.cblock]

	// Check if the signature is valid for the provided public key, and that the
	// transaction is also valid (the merkle proof will be validated as well).
	const isValid = tapScript.Signer.taproot.verify(tx_data, 0, {
		pubkey: pubkey,
		throws: true
	})

	if (!isValid) {
		throw new Error("Invalid build transaction")
	}
	let txHex = await tapScript.Tx.encode(tx_data).hex

	return txHex;
}

//广播交易
/**
 * @param {string} txHex
 */
async function broadcast_tx(txHex) {
	let response = await await get(BRC20pmNode_Url + "/broadcast/" + txHex)
	if (response) {
		let result = response.data
		if (result.code == 200) {
			return result.data
		} else {
			util.log(`call failed: ${result.msg}`)
		}
	}
}



//发送GET请求
/**
 * @param {string} url
 */
async function get(url,) {
	try {
		return await service.get(url)
	} catch (error) {
		if (error.response) {
			util.log(error.response.data.msg)
		}
	}
}

//发送POST请求
/**
 * @param {string} url
 * @param {any} data
 */
async function post(url, data) {
	try {
		return await service.post(url, data)
	} catch (error) {
		if (error.response) {
			util.log(error.response.data.msg)
		} else {
			util.log(error.message)
		}
	}
}



/**
 * 从某个HTML文件读取能被Webview加载的HTML内容
 * @param {*} context 上下文
 * @param {*} templatePath 相对于插件根目录的html文件相对路径
 */
function getWebViewContent(context, templatePath) {
	const resourcePath = util.getExtensionFileAbsolutePath(context, templatePath);
	let html = fs.readFileSync(resourcePath, 'utf-8');
	return html;
}


/* 
读取当前选中的工作空间下的文件
*/
function getPorjectFiles() {
	let workspaceFolders = vscode.workspace.workspaceFolders.map(item => item.uri.path);
	if (workspaceFolders.length === 1) {
		let files = util.getPorjectFiles(workspaceFolders[0])
		return files;
	}
	util.log("The project workspace can only have one directory")
	return
}


/* 
获取指定文件内容
*/
/**
 * @param {any} path
 */
function getFileContent(path) {
	return util.getFileContent(path);
}


//编译代码
/**
 * @param {any} filePath
 */
function codeCompile(filePath) {
	let code = getFileContent(filePath);

	try {
		abi(code)
	} catch (e) {
		util.log(e.toString());
		return false
	}


	// 使用正则表达式来匹配在 this.event 之后是否存在 return
	// const rreturnRegex = /this\.event[\s\S]*return;/;

	// const hasReturn = rreturnRegex.test(code);

	// if (hasReturn) {
	// 	util.log("在this.event({$})事件代码行下面不准有 return","如果你想在事件后返回其他数据","你需要再定义一个函数用来记录事件.")
	// 	return false;
	// }


	return true;
}

//代码格式化
/**
 * @param {string} code
 */
function codeMinify(code) {
	const options = {
		warnings: true,
		keep_fargs: true,
		keep_fnames: true
	};
	const result = uglifyJS.minify(code, options);
	if (result.error) throw result.error;
	return result.code
}

//str转Hex
/**
 * @param {string} str
 */
function str2Hex(str) {
	const data = ec.encode(str);
	const hexString = Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
	return hexString
}

//生成支付方法
/**
 * @param {string} address
 * @param {Number} amount
 * @param {string} network
 */
async function genPayWith(address, amount, network) {
	let tag = "bitcoin:"
	tag += address
	tag += "?amount=" + amount
	tag += "&label=BRC20pm"

	switch (network) {
		case "testnet":
			tag += "&testnet=1"
			break;
		default:
			tag += "&testnet=0"
			break;
	}


	try {
		const qrCodeDataUrl = await qrcode.toDataURL(tag, {
			color: {
				dark: "#ffffFF",
				light: "#181818FF"
			}
		});
		let pay = {
			address,
			amount,
			network,
			url: tag,
			qrcode: qrCodeDataUrl
		}
		return pay;
	} catch (error) {
		util.error('Error generating QR code:', error);
		return null;
	}
}



/**
 * @param {string} field
 */
function isKeyword(field) {
	// 因为这里只是去检验不是生成ABI所以不需要排除init方法 'init'
	//在生成ABI的时候,我们不会去提供init方法的ABI所以需要添加上
	let keywords = [
		'__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
		'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf',
		'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
		'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
		'in', 'instanceof', 'import', 'let', 'new', 'return', 'super', 'switch', 'this',
		'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'event', 'randomInt',
		'randomFloat', 'deploy', 'md5e', 'sha256e', 'keccak256', 'base64e', 'base64d', 'NewContract', 'require',
		'constructor', 'tag', '_NewContract'
	];

	return keywords.includes(field);
}

/**
 * @param {string} field
 */
function isOwn(field) {
	let keywords = [
		'__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
		'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf',
	];
	return keywords.includes(field);
}

//获取指定文件的ABI
/**
 * @param {string} code
 */
function abi(code) {

	let ABI = []

	//加载一下协议标准以防编译不通过
	code = loadStandard(code);

	const Contract = new Function(code + ';;;; return new Contract();');
	const instance = Contract();

	if (!instance['init']) {
		throw new Error(`Class [Contract] need init func`)
	}

	let prototype = Object.getPrototypeOf(instance);


	Object.keys(instance).forEach(item => {
		if (typeof instance[item] === 'function') {
			throw new Error('itself and its parent class cannot have explicit functions [' + item + ']')
		}
	})

	/**
	 * @param {{ [x: string]: any; }} prototype
	 */
	function get_o_abi(prototype) {
		const descriptors = Object.getOwnPropertyDescriptors(prototype);
		Object.getOwnPropertyNames(prototype).forEach(funcName => {
			if (typeof prototype[funcName] === 'function') {
				let ds = descriptors[funcName]
				//检测是否存在异步函数
				if (ds) {
					if (funcName !== 'constructor' && ds.value.toString().includes('async')) {
						throw new Error('disable async function')
					}
				}


				let func = prototype[funcName];
				let params = extractParameters(func);
				//如果是私有函数或者是构造函数名称则跳过
				if (funcName == "constructor" || funcName.startsWith("_")) {
					return
				}
				if (!isKeyword(funcName)) {
					ABI.push({
						name: funcName,
						params
					})
				} else {
					if (!isOwn(funcName)) {
						throw new Error(`unavailable ${funcName} func`)
					}
				}
			}
		});

		// 递归获取所有原型函数
		const nextPrototype = Object.getPrototypeOf(prototype);
		if (nextPrototype !== null) {
			get_o_abi(nextPrototype);
		}
	}

	get_o_abi(prototype);
	return ABI;
}

/**
 * @param {{ toString: () => any; }} func
 */
function extractParameters(func) {
	let code = func.toString();
	let start = code.indexOf('(') + 1;
	let end = code.indexOf(')');
	let parameters = code.slice(start, end).split(',')
		.map(( /** @type {string} */ param) => param.trim())
		.filter(( /** @type {string} */ param) => param !== '');
	return parameters;
}



//将聪转为BTC
/**
 * @param {number} fee
 */
function getBtcValue(fee) {
	if (fee < 1000) {
		fee = 1000
	}

	return fee / 10 ** 8
}

//加载额外的库
/**
 * @param {string} code
 */
function loadStandard(code) {
	let sArray = ["class B20{}", "class B721{}"]
	let sAStr = sArray.toString()
	let sList = sAStr.split(",")
	let standard = ""
	sList.forEach((s => {
		standard += s + ";"
	}))
	return standard + code;
}


//关闭模态窗
function hiddenModal() {
	callWebView({
		cmd: 'hidden-modal',
		data: true
	})
}



//向webView发送消息
/**
 * @param {{ cmd: string; data: any; }} data
 */
function callWebView(data) {
	if (typeof data === 'string') {
		data = {
			cmd: 'ordinary',
			data: data
		};
	}
	Provider.postMessage(data)
}




module.exports = {
	WebViewProvider
}