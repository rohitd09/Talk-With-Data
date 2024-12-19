const bot = './assets/bot.svg';
const user = './assets/user.svg';

const form = document.querySelector('form');
const chatMessages = document.querySelector('#chat_messages');
const documentView = document.querySelector('#document_view');
const fileInput = document.querySelector('#file_input');

let loadInterval;

function loader(element) {
  element.textContent = '';
  loadInterval = setInterval(() => {
    element.textContent += '.';
    if (element.textContent === '....') {
      element.textContent = '';
    }
  }, 300);
}

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

function appendMessage(role, message) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = message;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('file', file);

    documentView.textContent = 'Uploading document...';
    try {
      const response = await fetch('http://localhost:8889/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        const reader = new FileReader();

        reader.onload = function (e) {
          documentView.textContent = e.target.result;
        };
        reader.readAsText(file);

        appendMessage('bot', `Document "${result.filename}" uploaded successfully. You can now ask questions about it!`);
      } else {
        documentView.textContent = 'Error uploading the document. Try again.';
      }
    } catch (error) {
      console.error('File upload failed:', error);
      documentView.textContent = 'Network error: Unable to upload document.';
    }
  }
}

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
  loader(bubble);

  try {
    const response = await fetch('http://localhost:8889/', {
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