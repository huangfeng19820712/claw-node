const { WebSocketSender } = require('../dist/modules/websocket-sender')
const fs = require('fs')
const path = require('path')
const os = require('os')

function loadIdentity() {
  const identityDir = path.join(os.homedir(), '.openclaw', 'identity')
  const deviceAuth = JSON.parse(fs.readFileSync(path.join(identityDir, 'device-auth.json'), 'utf8'))
  const device = JSON.parse(fs.readFileSync(path.join(identityDir, 'device.json'), 'utf8'))
  return {
    deviceId: device.deviceId,
    deviceToken: deviceAuth.tokens.node.token,
    privateKey: device.privateKeyPem,
    publicKey: device.publicKeyPem,
  }
}

async function main() {
  const identity = loadIdentity()
  const sender = new WebSocketSender({
    gatewayHost: 'localhost',
    gatewayPort: 18789,
    deviceToken: identity.deviceToken,
    deviceId: identity.deviceId,
    privateKey: identity.privateKey,
    publicKey: identity.publicKey,
  })

  await sender.connect()
  await sender.sendMessage('ou_f83886ae0d75c6b709967d289d6a46e3', '你好，能收到消息？', {
    channel: 'feishu',
  })
  console.log('发送成功')
  sender.disconnect()
}

main()
