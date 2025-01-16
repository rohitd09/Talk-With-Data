import express from 'express';
import * as dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createRetrieverTool } from 'langchain/tools/retriever';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { S3Loader } from "@langchain/community/document_loaders/web/s3";
import { generateUploadURL } from './s3.js';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { log } from 'console';

// // Set up __dirname for ES Modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// Configure environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Variables
let vectorStore;
let retriever;
let agentExecutor;
const memory = new MemorySaver(); // Persistent memory

async function initializeLLM(bucket_key) {
  try {
    console.log('Initializing LLM with current documents...');

    // Load documents
    const loader = new S3Loader({
      bucket: process.env.AWS_BUCKET_NAME,
      key: bucket_key,
      s3Config: {
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      },
      unstructuredAPIURL: process.env.UNSTRUCTURED_API_URL,
      unstructuredAPIKey: process.env.UNSTRUCTURED_API_KEY, // this will be soon required
    });
    
    const docs = await loader.load();

    if (docs.length === 0) {
      console.warn('No documents found in the data directory. Skipping initialization.');
      return;
    }

    // Create embeddings and retriever
    vectorStore = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());
    retriever = vectorStore.asRetriever();

    // Create retriever tool
    const retrieverTool = createRetrieverTool(retriever, {
      name: 'talk_with_data',
      description: `You are a virtual assistant who recalls conversations stored in the uploaded document. 
                    Provide concise and accurate answers based on the document's content.`,
    });

    // Initialize LLM and tools
    const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
    agentExecutor = createReactAgent({
      llm: llm,
      tools: [retrieverTool],
      checkpointSaver: memory,
    });

    console.log('LLM and tools initialized successfully.');
  } catch (error) {
    console.error('Error initializing LLM:', error);
  }
}

// Rate Limiting Middleware (No Limits)
function rateLimiter(req, res, next) {
  next();
}

// Set up Multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => cb(null, `${file.originalname}`),
});

// Routes
app.get('/', (req, res) => {
  res.send({ message: 'Talk With Data Server is Running!' });
});

app.post('/initialize-llm', async (req, res) => {
  try {
    const { transcriptName } = req.body;
    if (!transcriptName) {
      return res.status(400).json({ error: 'Transcript name is required.' });
    }

    // Call the initializeLLM function with the transcript name
    await initializeLLM(transcriptName);
    res.status(200).json({ message: 'LLM initialized successfully.' });
  } catch (error) {
    console.error('Error initializing LLM:', error);
    res.status(500).json({ error: 'Failed to initialize LLM.' });
  }
});

// Route to generate presigned upload URL
app.post('/upload-url', async (req, res) => {
  try {
    // Generate the presigned URL and transcript name
    const { uploadURL, transcriptName } = await generateUploadURL();
    // Send the presigned URL and transcript name to the client
    res.status(200).json({ uploadURL, transcriptName });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL.' });
  }
});

// Chat Route
app.post('/', rateLimiter, async (req, res) => {
  try {
    const prompt = req.body.prompt;
    
    if (!agentExecutor) {
      console.error('Agent executor is not initialized.');
      return res.status(500).json({ error: 'LLM is not initialized. Upload a document first.' });
    }

    let finalContent;
    for await (const response of await agentExecutor.stream(
      { messages: [new HumanMessage(prompt)] },
      { configurable: { thread_id: uuidv4() } }
    )) {
      if (response?.agent?.messages?.[0]?.content) {
        finalContent = response.agent.messages[0].content;
        break;
      }
    }

    res.status(200).send({ bot: finalContent || 'No response from the agent.' });
  } catch (error) {
    console.error('Error handling user prompt:', error);
    res.status(500).send({ error: 'Failed to process the request.' });
  }
});

// Start the server and initialize LLM
const PORT = process.env.PORT || 8889;
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});