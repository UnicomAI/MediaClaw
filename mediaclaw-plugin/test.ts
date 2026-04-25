import { YuanjingClient } from "./src/api/yuanjing-client.js";

const config = {
  apiKey: process.env.UNICOM_API_KEY || "",
  baseUrl: process.env.UNICOM_API_ENDPOINT || "https://maas-api.ai-yuanjing.com",
};

const client = new YuanjingClient(config);

async function testTextToImage() {
  console.log("=== 测试文生图 ===");
  const result = await client.textToImage("一只可爱的猫咪", "1:1", 1, "qwen-image-20b");
  console.log("code:", result.code, "msg:", result.msg);
  console.log("生成图片数:", (result.data as any[])?.length);
}

async function testImageQA() {
  console.log("\n=== 测试图文问答 ===");
  console.log("注意：需要提供本地图片路径");
  // const result = await client.imageQA(["/path/to/image.jpg"], "这是什么？", "general");
  // console.log(result);
}

async function main() {
  if (!config.apiKey) {
    console.error("请设置 UNICOM_API_KEY 环境变量");
    console.error("export UNICOM_API_KEY=sk-xxx");
    process.exit(1);
  }

  console.log("配置:", {
    baseUrl: config.baseUrl,
  });

  try {
    await testTextToImage();
    // await testImageQA();
  } catch (e) {
    console.error("错误:", e);
  }
}

main();
