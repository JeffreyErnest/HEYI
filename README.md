![Heyi_Logo](heyi_logo.png)
By Isabel DiFabio and Jeffrey Ernest

**HEYI** (short for "Hey, AI!") is a full-stack Chrome extension built to help users identify AI-generated text and images on ecommerce websites. By combining a custom-trained machine learning model with a proactive MongoDB-backed warning system, HEYI provides transparency for everyone to be able to shop without fear of being scammed by the bad actors of AI.

---

## Inspiration
In the current ever-changing world of AI, so much of the way we live, do business, and interact with one another is changing on the daily. However, with every new and exciting technology comes bad actors. With the rise of AI, there are many scam products on the market using fake images and fake descriptions. While some more tech-savy minds may be able to pick out these scams, as AI image generation gets even more realistic, more and more people are falling victim to these scams. This issue dispropotionately affects seniors, whom were our primary customer base with this product in mind. In our personal experience, we have seen our parents and grandparents fall victim to these scams, losing out on tens if not hundreds of dollars. Our goal with this chrome extension was to help people identify if the prpduct they are planning on purchasing is using AI generated images or content to help prevent these problems in the future. 

---

## Key Features

* **Dual-Mode Scanning**: This extension analyzes both on-page text and images for AI signatures using a fine-tuned classification model.
* **Proactive Alerts**: There are automatic alerts that trigger when you visit domains with a high history of AI-generated content.
* **Custom Brain**: Powered by a custom model trained on 100,000+ samples, with a 98% accuracy rate, hosted on Hugging Face.
* **AI vs AI**: Uses Google Gemini for image processing to identify common AI image signatures

---

## Technology Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Render (Web Services), JavaScript (Chrome Extension API), HTML5, CSS3 |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB Atlas (Cloud) |
| **ML Model** | Python, Kaggle, Hugging Face Transformers |
| **Inference** | Hugging Face Inference API / Gemini API |

---

## Installation & Setup

### 1. Prerequisites
* [Node.js](https://nodejs.org/) installed (v16+).
* A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account and cluster.
* A [Hugging Face](https://huggingface.co/) API Token.

### 2. Backend Setup
1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/yourusername/HEY-AI.git](https://github.com/yourusername/HEY-AI.git)
    cd HEY-AI/ai-detector-backend
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Create a `.env` file in the `backend` folder:
    ```env
    PORT=3000
    MONGO_URI=your_mongodb_connection_string
    HF_TOKEN=your_huggingface_access_token
    ```
4.  **Start the Server**:
    ```bash
    node server.js
    ```

### 3. Extension Setup
1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Toggle **Developer Mode** to **ON** (top right corner).
3.  Click **Load unpacked** and select the `extension` folder from this project directory.
4.  Pin the **HEYI** icon to your toolbar.

---

## Project Structure

* `extension/background.js`: Manages the proactive warning system and native Chrome notifications.
* `extension/heyi.js`: Handles DOM scraping and communicates with the backend.
* `ai-detector-backend/server.js`: The Express server managing MongoDB connections and AI inference routing.
* `Kaggle_Notebook.ipynb`: The training script used to fine-tune the model and push to Hugging Face.

---

## How It Works

1.  **Detection**: When a user triggers a scan, the extension scrapes text and image metadata, sending it to the Node.js backend.
2.  **Inference**: The backend queries the **Hugging Face Inference API** using the custom `toothsocket/ai-detector-50k` model.
3.  **Proactive Warning**: The background script monitors active tabs. If a domain matches a record in the "AI-Flagged" database, a native system notification is triggered immediately.

---

## Contributing
We made this project in 24 hours during the TCNJ 2026 hackathon, and hope to expand on it. If you have any ideas for features or things you would change, feel free to put up a pull request! Thank you!

---

**Keep the interent human <3**


