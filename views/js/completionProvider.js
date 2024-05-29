const vscode = require('vscode');
const util = require('../../util');

class MyCompletionProvider {

    constructor(context) {
        this.context = context
    }

    provideCompletionItems() {
        const completionItems = [];
        //读取代码提示数组
        let lablesStr = getCodeLables(this.context, '/views/json/code.json')
        let lables = JSON.parse(lablesStr)
        lables.forEach(lable => {
            // 添加自定义的选择项
            let item;
            //
            switch (lable.kid) {
                case 'Snippet':
                    item = new vscode.CompletionItem(lable.name, vscode.CompletionItemKind.Snippet);
                    break;
                case 'Function':
                    item = new vscode.CompletionItem(lable.name, vscode.CompletionItemKind.Function);
                    break;
                case 'Property':
                    item = new vscode.CompletionItem(lable.name, vscode.CompletionItemKind.Property);
                    break;
                default:
                    item = new vscode.CompletionItem(lable.name);
                    break;
            }
            //
            item.label = lable.label;
            item.insertText = new vscode.SnippetString(lable.insertText);
            item.detail = lable.detail;
            item.documentation = lable.documentation;
            completionItems.push(item);

        })


        // 返回CompletionItem数组
        return completionItems;
    }
}


/* 
获取指定文件内容
*/
function getCodeLables(context, templatePath) {
    const resourcePath = util.getExtensionFileAbsolutePath(context, templatePath);
    let labelObj = util.getFileContent(resourcePath)
    return labelObj;
}


module.exports = {
    MyCompletionProvider
}