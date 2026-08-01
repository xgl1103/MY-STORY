// src/utils/Crypto.js
// AES-GCM 加密工具，使用 Web Crypto API（功能规划 10.3 节）
// 用于加密用户的 API Key

// 加密密钥的派生盐值和密钥材料
// 使用固定密钥简化实现（本地存储场景，主要防止明文泄露）
const SALT = 'mystory_salt_v1'
const KEY_MATERIAL = 'mystory_key_v1'

let cryptoKey = null

// 从密钥材料派生 AES-GCM 密钥
async function getKey() {
  if (cryptoKey) return cryptoKey

  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(KEY_MATERIAL),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  return cryptoKey
}

// 加密：返回 base64 字符串（iv + 密文拼接后 base64 编码）
export async function encrypt(plaintext) {
  if (!plaintext) return null
  try {
    const key = await getKey()
    const encoder = new TextEncoder()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    )
    // 将 iv 和密文拼接后转 base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(ciphertext), iv.length)
    return uint8ArrayToBase64(combined)
  } catch (e) {
    console.error('加密失败:', e)
    return null
  }
}

// 解密：从 base64 字符串还原明文
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null
  try {
    const key = await getKey()
    const combined = base64ToUint8Array(encryptedBase64)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    console.error('解密失败:', e)
    return null
  }
}

// ===== Base64 工具函数 =====

function uint8ArrayToBase64(data) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export default { encrypt, decrypt }
