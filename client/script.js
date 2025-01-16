const form = document.querySelector('form');
const chatMessages = document.querySelector('#chat_messages');
const documentView = document.querySelector('#document_view');
const fileInput = document.querySelector('#file_input');

let transcriptName = null; // Store the current transcript name

// Append chat messages to the chat container
function appendMessage(role, message) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = message;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show a typing loader for bot responses
function loader(element) {
  element.textContent = '';
  const loadInterval = setInterval(() => {
    element.textContent += '.';
    if (element.textContent === '....') {
      element.textContent = '';
    }
  }, 300);
  return loadInterval;
}

// Simulate typewriter effect for bot messages
function typeText(element, text) {
  let index = 0;
  const interval = setInterval(() => {
    if (index < text.length) {
      element.innerHTML += text[index++];
    } else {
      clearInterval(interval);
    }
    element.scrollIntoView({ behavior: 'smooth' });
  }, 50);
}

// Handle file uploads using S3 presigned URL
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    try {
      documentView.textContent = 'Uploading document...';

      // Step 1: Get the presigned URL and transcript name from the server
      const response = await fetch('https://talk-with-data.vercel.app/upload-url', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to get upload URL.');

      const { uploadURL, transcriptName: name } = await response.json();
      transcriptName = name; // Save the transcript name

      // Step 2: Upload the file to S3 using the presigned URL
      const s3Response = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!s3Response.ok) throw new Error('Failed to upload file to S3.');

      // Step 3: Display the uploaded file content in the document view
      const reader = new FileReader();
      reader.onload = function (e) {
        documentView.textContent = e.target.result;
      };
      reader.readAsText(file);

      appendMessage('bot', `File "${file.name}" uploaded successfully and linked to the RAG model!`);
    } catch (error) {
      console.error('File upload failed:', error);
      appendMessage('bot', 'Error: Unable to upload the file.');
      documentView.textContent = 'Error uploading document. Please try again.';
    }
  }
}

// Handle user chat submissions
async function handleSubmit(event) {
  event.preventDefault();

  const userMessage = form.querySelector('textarea').value.trim();
  if (!userMessage) return;

  // Display user message
  appendMessage('user', userMessage);
  form.reset();

  // Show loader for bot response
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble bot';
  chatMessages.appendChild(bubble);
  const loadInterval = loader(bubble);

  try {
    const response = await fetch('https://talk-with-data.vercel.app/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userMessage }),
    });

    clearInterval(loadInterval);
    bubble.textContent = '';

    if (response.ok) {
      const data = await response.json();
      typeText(bubble, data.bot.trim());
    } else {
      bubble.textContent = 'Error: Unable to process the response.';
    }
  } catch (error) {
    clearInterval(loadInterval);
    bubble.textContent = 'Error: Network issue or API unavailable.';
    console.error(error);
  }
}

// Event Listeners
fileInput.addEventListener('change', handleFileUpload);
form.addEventListener('submit', handleSubmit);