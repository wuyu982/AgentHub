import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ['@libsql/client', '@opentelemetry/sdk-node', '@zilliz/milvus2-sdk-node'],
}

export default nextConfig
