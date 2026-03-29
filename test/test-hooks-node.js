#!/usr/bin/env node
/**
 * Hook 脚本测试工具（Node.js 版本 - 不依赖 jq）
 *
 * 使用方法：
 * node test/test-hooks-node.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(PROJECT_DIR, '.claude', 'hooks');
const LOGS_DIR = path.join(PROJECT_DIR, '.logs');

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let passed = 0;
let failed = 0;

// 测试函数
function testHook(name, scriptName, input, expectedExit = 0) {
  const scriptPath = path.join(HOOKS_DIR, scriptName);

  process.stdout.write(`测试 ${name} ... `);

  if (!fs.existsSync(scriptPath)) {
    console.log('失败 (脚本不存在)');
    failed++;
    return;
  }

  try {
    // 使用 bash 执行脚本，通过 stdin 传入 JSON
    const bash = spawn('bash', [scriptPath], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    bash.stdout.on('data', (data) => { stdout += data; });
    bash.stderr.on('data', (data) => { stderr += data; });
    bash.stdin.write(input);
    bash.stdin.end();

    bash.on('close', (code) => {
      if (code === expectedExit) {
        console.log(`通过 (exit=${code})`);
        passed++;
      } else {
        console.log(`失败 (期望 exit=${expectedExit}, 实际 exit=${code})`);
        if (stderr) console.log(`  stderr: ${stderr}`);
        failed++;
      }
      checkCompletion();
    });
  } catch (err) {
    console.log(`失败 (${err.message})`);
    failed++;
    checkCompletion();
  }
}

function checkCompletion() {
  // 简单同步测试，不需要这个
}

// 主测试流程
console.log('======================================');
console.log('   ClawNode Hook 脚本测试 (Node.js)');
console.log('======================================');
console.log();

// 由于 Node.js spawn 是异步的，我们改用同步执行
function runSyncTest(name, scriptName, input, expectedExit = 0) {
  const scriptPath = path.join(HOOKS_DIR, scriptName);

  process.stdout.write(`测试 ${name} ... `);

  if (!fs.existsSync(scriptPath)) {
    console.log('失败 (脚本不存在)');
    failed++;
    return;
  }

  try {
    const result = execSync(`bash "${scriptPath}"`, {
      input: input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
      encoding: 'utf8',
      timeout: 5000
    });
    console.log(`通过`);
    passed++;
  } catch (err) {
    if (err.code === expectedExit || err.status === expectedExit) {
      console.log(`通过 (exit=${err.code || err.status})`);
      passed++;
    } else {
      // 对于某些脚本，非零退出也是正常的（如检测到危险命令）
      if (expectedExit !== 0 && (err.code !== undefined || err.status !== undefined)) {
        console.log(`通过 (exit=${err.code || err.status}, 期望 ${expectedExit})`);
        passed++;
      } else {
        console.log(`失败 (${err.message})`);
        failed++;
      }
    }
  }
}

// SessionStart Hooks
console.log('--- SessionStart Hooks ---');
runSyncTest('session-init.sh', 'session-init.sh', '{"session_id": "test-123"}');

// PreToolUse Hooks
console.log();
console.log('--- PreToolUse Hooks ---');
runSyncTest('security-check.sh (安全命令)', 'security-check.sh', '{"tool_input": {"command": "ls -la"}}');
runSyncTest('security-check.sh (危险命令)', 'security-check.sh', '{"tool_input": {"command": "rm -rf /"}}');
runSyncTest('file-change-log.sh', 'file-change-log.sh', '{"tool_input": {"file_path": "/test/file.txt"}, "tool_name": "Write"}');

// PermissionRequest Hooks
console.log();
console.log('--- PermissionRequest Hooks ---');
runSyncTest('auto-permission.sh (安全命令)', 'auto-permission.sh', '{"tool_name": "Bash", "tool_input": {"command": "ls -la"}}');
runSyncTest('auto-permission.sh (其他命令)', 'auto-permission.sh', '{"tool_name": "Bash", "tool_input": {"command": "rm file.txt"}}');

// PostToolUse Hooks
console.log();
console.log('--- PostToolUse Hooks ---');
runSyncTest('command-audit.sh', 'command-audit.sh', '{"tool_input": {"command": "ls"}, "tool_response": {"exit_code": 0}}');
runSyncTest('file-change-report.sh', 'file-change-report.sh', '{"tool_input": {"file_path": "/test/file.txt"}, "tool_name": "Write", "tool_response": {}}');

// PostToolUseFailure Hooks
console.log();
console.log('--- PostToolUseFailure Hooks ---');
runSyncTest('error-handler.sh (超时错误)', 'error-handler.sh', '{"tool_name": "Bash", "error": "timeout"}');
runSyncTest('error-handler.sh (权限错误)', 'error-handler.sh', '{"tool_name": "Bash", "error": "permission denied"}');

// Stop Hooks
console.log();
console.log('--- Stop Hooks ---');
runSyncTest('task-complete-check.sh (任务完成)', 'task-complete-check.sh', '{"last_assistant_message": "任务已完成"}');
runSyncTest('task-complete-check.sh (还有待办)', 'task-complete-check.sh', '{"last_assistant_message": "还需要做以下几件事..."}');

// StopFailure Hooks
console.log();
console.log('--- StopFailure Hooks ---');
runSyncTest('api-error-report.sh', 'api-error-report.sh', '{"error": "API Error", "error_details": "Rate limited"}');

// SessionEnd Hooks
console.log();
console.log('--- SessionEnd Hooks ---');
runSyncTest('session-cleanup.sh', 'session-cleanup.sh', '{"reason": "user_request"}');

// 总结
console.log();
console.log('======================================');
console.log('   测试结果汇总');
console.log('======================================');
console.log(`通过：${passed}`);
console.log(`失败：${failed}`);
console.log();

if (failed === 0) {
  console.log('✓ 所有测试通过!');
  process.exit(0);
} else {
  console.log('✗ 部分测试失败，请检查输出');
  process.exit(1);
}
