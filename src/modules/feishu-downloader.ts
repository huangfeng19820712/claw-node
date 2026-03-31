/**
 * 飞书附件下载器
 * 通过飞书开放平台 API 下载用户发送的附件
 */

import { writeFileSync } from 'fs'
import https from 'https'
import http from 'http'

export interface FeishuDownloadOptions {
  appId: string
  appSecret: string
}

/**
 * 获取飞书配置（优先命令行参数，其次环境变量）
 */
export function getFeishuConfig(): { appId: string; appSecret: string } | null {
  // 1. 环境变量（已经在 config.ts 中加载了 ~/.clawnode/config.env）
  const envAppId = process.env.FEISHU_APP_ID
  const envAppSecret = process.env.FEISHU_APP_SECRET
  if (envAppId && envAppSecret) {
    return { appId: envAppId, appSecret: envAppSecret }
  }

  return null
}

export interface DownloadResult {
  success: boolean
  filePath?: string
  error?: string
}

/**
 * 获取飞书 tenant_access_token
 */
async function getAccessToken(options: FeishuDownloadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      app_id: options.appId,
      app_secret: options.appSecret,
    })

    const req = https.request(
      {
        hostname: 'open.feishu.cn',
        path: '/open-apis/auth/v3/tenant_access_token/internal',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.code !== 0) {
              reject(new Error(`获取 Token 失败: ${json.msg}`))
              return
            }
            resolve(json.tenant_access_token)
          } catch (e) {
            reject(new Error(`解析 Token 响应失败: ${data}`))
          }
        })
      }
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * 下载飞书附件
 */
async function downloadFile(
  accessToken: string,
  messageId: string,
  fileKey: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=file`

    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (res) => {
        // 检查响应状态
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`))
          return
        }

        // 检查内容类型，判断是 JSON 错误还是文件内容
        const contentType = res.headers['content-type'] || ''
        if (contentType.includes('application/json')) {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              reject(new Error(`下载失败: ${json.msg || JSON.stringify(json)}`))
            } catch {
              reject(new Error(`下载失败: ${data}`))
            }
          })
          return
        }

        // 下载文件
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks)
            writeFileSync(outputPath, buffer)
            resolve()
          } catch (e: any) {
            reject(new Error(`保存文件失败: ${e.message}`))
          }
        })
      }
    )

    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('下载超时'))
    })
  })
}

/**
 * 下载飞书附件到本地
 */
export async function downloadFeishuFile(
  messageId: string,
  fileKey: string,
  outputPath: string,
  options: FeishuDownloadOptions
): Promise<DownloadResult> {
  try {
    // 1. 获取 Access Token
    console.error(`[FeishuDownload] 获取 Access Token...`)
    const accessToken = await getAccessToken(options)
    console.error(`[FeishuDownload] Token 获取成功`)

    // 2. 下载文件
    console.error(`[FeishuDownload] 开始下载文件: messageId=${messageId}, fileKey=${fileKey}`)
    console.error(`[FeishuDownload] 保存到: ${outputPath}`)
    await downloadFile(accessToken, messageId, fileKey, outputPath)

    console.error(`[FeishuDownload] 下载完成`)
    return {
      success: true,
      filePath: outputPath,
    }
  } catch (e: any) {
    console.error(`[FeishuDownload] 下载失败: ${e.message}`)
    return {
      success: false,
      error: e.message,
    }
  }
}
