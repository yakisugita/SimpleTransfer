import { Hono } from "hono"
import { R2Bucket } from "@cloudflare/workers-types"

type Bindings = {
  MY_STORAGE: R2Bucket
  KEY_SHA256: string
}

const app = new Hono<{Bindings: Bindings}>()

// アップロード
app.post("/", async (c:any) => {
  // keyが一致したときのみ受け付け
  const key = c.req.query("key")
  if (!key) return c.text("Missing key", 400)
  
  const hash = await getHash(key)

  console.log(`key : ${key}, hash : ${hash}, hashCorrect : ${c.env.KEY_SHA256}`)
  if (hash !== c.env.KEY_SHA256) return c.text("Unauthorized", 403)

  const form = await c.req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return c.text("Invalid file", 400)
  
  const uuid = crypto.randomUUID()
  await c.env.MY_STORAGE.put(uuid, file.stream())

  const fileHash = await getHash(await file.arrayBuffer())
  // fileIdとハッシュを返す
  return c.json({ uuid: uuid, hash: fileHash })
})

// ダウンロード
app.get("/", async (c:any) => {
  const fileId = c.req.query("fileId")
  const hash = c.req.query("hash")

  if (!fileId || !hash) return c.text("Missing parameters", 400)

  const object = await c.env.MY_STORAGE.get(fileId)
  if (!object) return c.text("File not found", 404)

  const fileBuffer = await object.arrayBuffer()
  const computedHash = await getHash(fileBuffer)

  if (computedHash !== hash) return c.text("Hash mismatch", 403)

  return new Response(fileBuffer, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" } })
})

async function getHash(original:string | ArrayBuffer) {
  const myText = (typeof(original) === "string")
    ? new TextEncoder().encode(original)
    : original
  
  const digest = await crypto.subtle.digest(
    {
      name: "SHA-256",
    },
    myText // The data you want to hash as an ArrayBuffer
  )
  const hashed = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
  return hashed
}

export default app
