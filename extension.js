// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');


const { WebViewProvider } = require('./views/js/webProvider');
const { MyCompletionProvider } = require('./views/js/completionProvider')

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	
	
	// 监听配置变化事件
	vscode.workspace.onDidChangeConfiguration(() => {
		// 设置主题颜色为现代深色
		vscode.workspace.getConfiguration().update("workbench.colorTheme", "Default Dark Modern", true);
	});


	// This line of code will only be executed once when your extension is activated
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('brc20pm.helloWorld', function () {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from BRC20pm-Plugin!');

	});
	context.subscriptions.push(disposable);

	//#########################################################
	// 注册WebviewViewProvider
	const provider = new WebViewProvider(context);
	const rWebView = vscode.window.registerWebviewViewProvider('idea-webview', provider);
	context.subscriptions.push(rWebView);

	// 注册CompletionItemProvider
	const completionProvider = new MyCompletionProvider(context);
	const rCompletion = vscode.languages.registerCompletionItemProvider('javascript', completionProvider)
	context.subscriptions.push(rCompletion);

}

// This method is called when your extension is deactivated
function deactivate() {
}

module.exports = {
	activate,
	deactivate
}
