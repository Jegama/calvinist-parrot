// utils/langChainTools/pgVectorTool.ts

// import {
//     PGVectorStore,
//     DistanceStrategy,
// } from "@langchain/community/vectorstores/pgvector";
// import { OpenAIEmbeddings } from "@langchain/openai";
// import { PoolConfig } from "pg";
// import { createRetrieverTool } from "langchain/tools/retriever";

// // Initialize embeddings (adjust model name as needed)
// const embeddings = new OpenAIEmbeddings({
//     model: "text-embedding-3-small",
// });

// // Sample config
// const config = {
//     postgresConnectionOptions: {
//       type: "postgres",
//       host: "127.0.0.1",
//       port: 5433,
//       user: "myuser",
//       password: "ChangeMe",
//       database: "api",
//     } as PoolConfig,
//     tableName: "testlangchainjs",
//     columns: {
//       idColumnName: "id",
//       vectorColumnName: "vector",
//       contentColumnName: "content",
//       metadataColumnName: "metadata",
//     },
//     // supported distance strategies: cosine (default), innerProduct, or euclidean
//     distanceStrategy: "cosine" as DistanceStrategy,
//   };

// // Initialize your PGVector store (provide your own configuration)
// const vectorStore = await PGVectorStore.initialize(embeddings, config);

// // Convert your vector store into a retriever
// const retriever = vectorStore.asRetriever({
//   k: 5,
// });

// // Wrap it as a tool
// export const pgVectorTool = createRetrieverTool(retriever, {
//     name: "PGVectorRetriever",
//     description: "Retrieves context from a PGVector store based on a query.",
// });
