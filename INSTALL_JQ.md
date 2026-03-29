# 安装 jq 的方法

## Windows

### 方法 1: 使用 Chocolatey (推荐)
```powershell
# 如果已安装 chocolatey
choco install jq
```

### 方法 2: 使用 Scoop
```powershell
# 如果已安装 scoop
scoop install jq
```

### 方法 3: 手动下载
1. 访问 https://github.com/jqlang/jq/releases
2. 下载 `jq-win64.exe` (或 `jq-win32.exe`)
3. 重命名为 `jq.exe`
4. 放到系统 PATH 中的某个目录，例如：
   - `C:\Windows\System32\`
   - 或 Git Bash 的 bin 目录：`C:\Program Files\Git\usr\bin\`

### 方法 4: 使用 winget
```powershell
winget install jqlang.jq
```

## 验证安装
```bash
jq --version
```

应该输出类似：`jq-1.7`

## macOS
```bash
brew install jq
```

## Linux

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install jq
```

### CentOS/RHEL
```bash
sudo yum install jq
```

### Arch Linux
```bash
sudo pacman -S jq
```

## 为什么需要 jq？

Hook 脚本使用 jq 来解析 JSON 输入，例如：

```bash
# 从 stdin 读取 JSON 并提取字段
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
```

没有 jq，脚本无法解析 Claude Code 传递的 JSON 数据。

## 如果没有 jq？

Hook 脚本仍然可以执行（不会阻塞 Claude Code），但无法：
- 解析输入数据
- 提取命令内容
- 生成 JSON 输出

基本功能（如记录日志）仍然可以工作，但安全检查等功能将失效。
