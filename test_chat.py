import requests
import json

# Test the chat API
try:
    # Create session
    session_response = requests.post('http://localhost:5000/api/chat/sessions', 
                                   json={'title': 'Test Session'})
    print(f"Session created: {session_response.status_code}")
    session_data = session_response.json()
    session_id = session_data['id']
    
    # Send message
    message_response = requests.post(f'http://localhost:5000/api/chat/sessions/{session_id}/messages',
                                   json={'role': 'user', 'content': 'grounding point debris'})
    print(f"Message sent: {message_response.status_code}")
    message_data = message_response.json()
    
    # Print AI response
    if 'aiMessage' in message_data:
        print(f"AI Response: {message_data['aiMessage']['content']}")
        print(f"Sources: {len(message_data['aiMessage'].get('sources', []))}")
    else:
        print(f"Full response: {json.dumps(message_data, indent=2)}")
        
except Exception as e:
    print(f"Error: {e}")