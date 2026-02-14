
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = "AIzaSyDicD9KcacsHDGZ4eFpvd-1RBXfXV0pnjI"; // From .env
const apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function testGoogle() {
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
            {
                model: "gemini-2.5-flash",
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "Hello" }
                ],
                stream: false
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                }
            }
        );
        console.log("Success:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error:", error.response ? error.response.status : error.message);
        if (error.response && error.response.data) {
            console.error("Error Data:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

testGoogle();
