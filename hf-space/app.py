import gradio as gr
from transformers import pipeline

# Load the model directly from the Hugging Face Hub
# The pipeline automatically downloads and caches the model weights
classifier = pipeline("text-classification", model="toothsocket/ai-detector-50k")

def analyze_text(text):
    if not text or len(text.strip()) == 0:
        return {"error": "No text provided", "aiPercentage": 0}
    
    try:
        # Run inference and safely truncate text to fit the model's 512 max limit constraint
        results = classifier(text, truncation=True, max_length=512)
        
        # The model returns a list like: [{'label': 'LABEL_1', 'score': 0.92}]
        # Extract the score for LABEL_1 (AI)
        ai_score = 0
        for result in results:
            if result['label'] == 'LABEL_1':
                ai_score = round(result['score'] * 100, 2)
                break
            # If your model uses label 1 for human, adjust this logic. 
            # Assuming LABEL_1 means AI based on your previous Node.js code.
            elif result['label'] == 'LABEL_0' and len(results) == 1:
                # If it only returned LABEL_0, AI score is 100 - Human score
                ai_score = round((1 - result['score']) * 100, 2)
                
        return {"aiPercentage": ai_score}
    except Exception as e:
        return {"error": str(e), "aiPercentage": 0}

# Create a simple Gradio interface which automatically creates an API endpoint
demo = gr.Interface(
    fn=analyze_text,
    inputs=gr.Textbox(lines=5, placeholder="Paste text here to analyze..."),
    outputs="json",
    title="HEYI AI Detector API",
    description="Backend API for the HEYI Chrome Extension. Send POST requests to `/api/predict`."
)

if __name__ == "__main__":
    # Launch the Gradio app
    demo.launch()
