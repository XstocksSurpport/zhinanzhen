' 双击本文件：不弹黑框，直接用默认浏览器打开 index.html
Option Explicit
Dim sh, fso, folder, html
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
html = folder & "\index.html"
If Not fso.FileExists(html) Then
  MsgBox "找不到 index.html，请和本文件放在同一文件夹里。", 48, "打不开"
  WScript.Quit 1
End If
sh.Run Chr(34) & html & Chr(34), 1, False
