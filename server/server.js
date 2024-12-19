import express from 'express';
import * as dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createRetrieverTool } from 'langchain/tools/retriever';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

// Set up __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Directory Paths
const DATA_DIR = path.join(__dirname, 'data');

// Initialize LLM and Vector Store
let vectorStore;
let retriever;
let agentExecutor;
let memory = new MemorySaver();

async function initializeLLM() {
  try {
    console.log('Re-initializing the LLM with the latest documents...');
    const loader = new DirectoryLoader(DATA_DIR, {
      '.txt': (filePath) => new TextLoader(filePath),
    });

    const docs = await loader.load();

    // Reinitialize the vector store
    vectorStore = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());
    retriever = vectorStore.asRetriever();

    // Add the retriever tool dynamically
    const retrieverTool = createRetrieverTool(retriever, {
      name: 'talk_with_data',
      description: `You are a patient recounting a conversation you had with your doctor to a third person who is asking questions about it. 
                    The conversation may include details about symptoms, diagnoses, treatments, and advice provided by the doctor. 
                    Respond in a natural and concise manner, as if you are recalling the events from memory, 
                    while maintaining accuracy about what was discussed. Avoid making assumptions beyond the content of the conversation.`,
    });

    const tools = [retrieverTool];

    // Reinitialize the agent executor
    const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
    agentExecutor = createReactAgent({
      llm: llm,
      tools: tools,
      checkpointSaver: memory,
    });

    console.log('LLM successfully re-initialized.');
  } catch (error) {
    console.error('Error initializing the LLM:', error);
  }
}

// Function to clear existing files in the data directory
async function clearDataDirectory() {
  try {
    const files = await fs.readdir(DATA_DIR);
    await Promise.all(files.map((file) => fs.unlink(path.join(DATA_DIR, file))));
    console.log('Data directory cleared.');
  } catch (error) {
    console.error('Error clearing data directory:', error);
  }
}

// No Rate Limiting Middleware
function rateLimiter(req, res, next) {
  next(); // Allow all requests without restriction
}

// Set up Multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await clearDataDirectory(); // Clear old files before saving a new one
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => cb(null, `${file.originalname}`),
});

const upload = multer({ storage });

// Routes
app.get('/', (req, res) => {
  res.send({ message: 'Talk With Data Server is Running!' });
});

// File Upload Route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    console.log(`File uploaded: ${req.file.filename}`);
    console.log('Reinitializing LLM with the uploaded document...');

    // Reinitialize the LLM with the uploaded file
    await initializeLLM();

    res.status(200).json({
      message: 'File uploaded and LLM re-initialized successfully.',
      filename: req.file.filename,
    });
  } catch (error) {
    console.error('Error during file upload:', error);
    res.status(500).json({ error: 'Failed to process the uploaded file.' });
  }
});

// Chat Route
app.post('/', rateLimiter, async (req, res) => {
  try {
    const prompt = req.body.prompt;

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

// Start the server and initialize vector store
const PORT = process.env.PORT || 8889;
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  await clearDataDirectory(); // Ensure the data directory starts empty
  await initializeLLM(); // Load vector store and reinitialize LLM on startup
});