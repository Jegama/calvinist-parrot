import streamlit as st
from PIL import Image
import re, os, datetime
import pandas as pd
import google_connector as gc
from sqlalchemy.orm import sessionmaker
from datetime import datetime as dt

from llama_index.core.llms import ChatMessage, MessageRole

from parrot_ai import v2_brain
import parrot_ai.ccel_index as ccel

# Setting up the language
if 'language' not in st.session_state:
    if st.session_state['logged_in'] == False:
        if st.session_state['url'] == 'loro':
            st.session_state['language'] = 'Español'
        else:
            st.session_state['language'] = 'English'

if st.session_state['language'] in ['Español', 'Spanish']:
    from parrot_toolkit.spanish_text import *
else:
    from parrot_toolkit.english_text import *

pool = gc.connect_with_connector('parrot_db')
SessionLocal = sessionmaker(bind=pool)

parrot_icon = Image.open("app/calvinist_parrot.ico")

gpt_model = os.environ.get("GPT_MODEL")

from openai import OpenAI
client = OpenAI()

def parse_parrot_messages(parrot_messages):
    custom_chat_history = []
    for message in parrot_messages:
        if message["role"] == "user":
            custom_chat_history.append(
                ChatMessage(
                    role=MessageRole.USER,
                    content=message["content"],
                )
            )
        else:
            custom_chat_history.append(
                ChatMessage(
                    role=MessageRole.ASSISTANT,
                    content=message["content"],
                )
            )
    return custom_chat_history

def get_response(messages_list, model_to_use = gpt_model, stream=True):
    response = client.chat.completions.create(
        model=model_to_use,
        messages=messages_list,
        stream=stream,
        temperature = 0
    )
    return response

def generate_followup_prompt(question, first_answer):
    followup_prompt = f"""\
The user asked the following question: {question}

And a GPT-4o-mini Fine Tuned with the Baptist Catechism answered: {first_answer}

Please review the answer and elaborate on it. You can add more information, or correct any mistakes. Remember to keep the conversation in line with the 1689 London Baptist Confession of Faith. Acknowledge what the other response, and help the user understant the concept better.
"""
    return followup_prompt

def extractQuestions(text):
    pattern = r"\/\/(.*?)\/\/"
    questions = re.findall(pattern, text)
    return questions

def generate_conversation_name(current_conversation):
    prompt_create_name = f"""I have this conversation:

---------------------
{current_conversation}
---------------------

What would you like to name this conversation? It can be a short name to remember this conversation.

Please reply in the following JSON format:

{{
    "name": string \\ Name of the conversation in {st.session_state['language']}
}}

Always return response as JSON."""


    get_name_prompt = [
        {"role": "system", "content": 'You are a helpful assistant that can create short names for conversations.'}, {"role": "user", "content": prompt_create_name}
    ]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={ "type": "json_object" },
        messages=get_name_prompt,
        temperature = 0
    )
    conversation_name = response.choices[0].message.content
    try:
        conversation_name = eval(conversation_name)['name']
        return conversation_name
    except:
        generate_conversation_name(current_conversation)

# Create or update conversation history in the database
def create_or_update_conversation(conversation_table, user_id, conversation_name, messages):
    db = SessionLocal()
    try:
        # Check if the conversation already exists
        conversation = db.query(conversation_table).filter(
            conversation_table.user_id == user_id, 
            conversation_table.conversation_name == conversation_name
        ).first()

        if conversation:
            # Update the conversation
            conversation.messages = messages
            conversation.modified = dt.now(datetime.UTC)
        else:
            # Create a new conversation
            new_conversation = conversation_table(
                user_id=user_id, 
                conversation_name=conversation_name, 
                messages=messages,
                created = dt.now(datetime.UTC)
            )
            db.add(new_conversation)
        db.commit()
    except Exception as e:
        st.error(f"{ERROR_CREATING_CONVERSATION}: {e}")
    finally:
        db.close()

def get_conversation_history(conversation_table, user_id):
    db = SessionLocal()
    try:
        conversations = db.query(conversation_table).filter(
            conversation_table.user_id == user_id
        ).order_by(conversation_table.created.desc()).all()
    except Exception as e:
        st.error(f"{ERROR_GETTING_HISTORY}: {e}")
    finally:
        db.close()
    return conversations

# Load the conversation history for the logged-in user and display it in the sidebar
def load_conversation_history(conversation_table, user_id, messages_id):
    conversations = get_conversation_history(conversation_table, user_id)
    
    if len(conversations) == 0:
        st.sidebar.write(NO_HIST)
    else:
        for idx, conversation in enumerate(conversations):
            if st.sidebar.button(conversation.conversation_name, key=f"conversation_button_{idx}"):
                # Load the selected conversation into st.session_state['messages']
                st.session_state[messages_id] = conversation.messages
                if messages_id == 'parrot_messages':
                    v2_brain.load_selected_conversation()
                else:
                    load_conversation(messages_id)
                if messages_id == 'ccel_messages':
                    chat_engine_chat_history = parse_parrot_messages(st.session_state[messages_id])
                    st.session_state["ccel_engine"] = ccel.ccel_chat_engine(chat_engine_chat_history)
                st.session_state['new_conversation'] = False
                st.session_state['conversation_name'] = conversation.conversation_name
                st.rerun()

def load_conversation(messages_id):
    for msg in st.session_state[messages_id]:
        avatar_ = "🧑‍💻" if msg["role"] == "user" else parrot_icon
        st.chat_message(msg["role"], avatar=avatar_).write(msg["content"])
        if "consulted_sources" in msg.keys():
            with st.expander(CONSULTED_SOURCES):
                ccel.display_consulted_sources(msg["consulted_sources"])