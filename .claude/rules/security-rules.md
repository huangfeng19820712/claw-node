# ClawNode 安全规则

## 危险命令黑名单

以下命令模式被严格禁止：

1. **系统破坏命令**
   - `rm -rf /` - 删除根目录
   - `dd if=/dev/zero` - 磁盘覆盖
   - `:(){:|:&};:` - Fork 炸弹
   - `mkfs` - 格式化文件系统
   - `chmod -R 777 /` - 开放所有权限

2. **远程代码执行**
   - `curl.*|.*bash` - 下载并执行
   - `wget.*|.*bash` - 下载并执行

## 敏感文件路径

访问以下路径需要用户确认：

- `/etc/passwd` - 用户信息
- `/etc/shadow` - 密码哈希
- `~/.ssh` - SSH 密钥
- `/root/` - 管理员目录

## 自动批准的命令

以下命令类型自动批准执行：

- `ls` - 列出文件
- `cat` - 查看文件内容
- `grep` - 搜索文本
- `echo` - 输出文本
- `pwd` - 当前目录
- `git status` - Git 状态
- `npm test` - 运行测试
- `npm run build` - 构建项目

## 审计要求

所有命令执行都会被记录到：

- `.logs/command-audit.jsonl` - 命令审计日志
- `.logs/file-changes.log` - 文件变更记录
- `.logs/errors.log` - 错误日志
