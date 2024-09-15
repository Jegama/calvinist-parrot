import streamlit as st
import asyncio, os
from openai import OpenAI
from openai import AsyncOpenAI
import google_connector as gc
from sqlalchemy.orm import sessionmaker
from parrot_toolkit.sql_models import ChainReasoning

# create engine
pool = gc.connect_with_connector('parrot_db')

from parrot_ai import chat_functions
from parrot_ai.core.prompts import CATEGORIZING_SYS_PROMPT, QUICK_CHAT_SYS_PROMPT, FT_SYS_PROMPT, CALVIN_QUICK_SYS_PROMPT
from parrot_ai.core.prompts import n_shoot_examples, reasoning_prompt, answer_prompt, follow_up_prompt, refusing_prompt


async_client = AsyncOpenAI()
client = OpenAI()

ft_model  = os.environ.get("FT_MODEL")
mini_model = "gpt-4o-mini"
big_model = "gpt-4o-2024-08-06"

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

async def get_async_response(placeholder, messages_list, model_to_use):
    stream = await client.chat.completions.create(
        model=model_to_use,
        messages=messages_list,
        stream=True
    )
    streamed_text = ""
    async for chunk in stream:
        chunk_content = chunk.choices[0].delta.content
        if chunk_content is not None:
            streamed_text = streamed_text + chunk_content
            placeholder.info(streamed_text)

def get_response(placeholder, messages_list, model_to_use = mini_model, stream=True):
    response = client.chat.completions.create(
        model=model_to_use,
        messages=messages_list,
        stream=stream,
        temperature = 0
    )
    answer = ""
    for event in response:
        chunk_content = event.choices[0].delta.content
        if chunk_content is not None:
            answer += chunk_content
            placeholder.info(answer)

def reset_chain():
    st.session_state["1_caterogizing"] = [{"role": "system", "content": CATEGORIZING_SYS_PROMPT}]  + n_shoot_examples
    st.session_state["2_reasoning_a"] = [{"role": "system", "content": FT_SYS_PROMPT}]
    st.session_state["2_reasoning_b"] = [{"role": "system", "content": QUICK_CHAT_SYS_PROMPT}]
    st.session_state["2_reasoning_c"] = [{"role": "system", "content": CALVIN_QUICK_SYS_PROMPT}]
    st.session_state["3_reasoning"] = [{"role": "system", "content": QUICK_CHAT_SYS_PROMPT}]
    st.session_state["parrot_follow_up"] = [{"role": "system", "content": QUICK_CHAT_SYS_PROMPT}]
    st.session_state["4_refusing"] = [{"role": "system", "content": QUICK_CHAT_SYS_PROMPT}]
    st.session_state["reasoning_prompt"] = reasoning_prompt
    st.session_state["answer_prompt"] = answer_prompt
    st.session_state["follow_up_prompt"] = follow_up_prompt
    st.session_state["refusing_prompt"] = refusing_prompt
    st.session_state["refuse"] = False
    for key in ["user_question", "reformatted_question", "category", "subcategory", "issue_type", "first_answer", "second_answer", "third_answer", "reviewed_answer", "follow_up", "refuse_answer"]:
        st.session_state[key] = ""
    st.session_state["keys_to_save"] = ["user_question", "reformatted_question", "category", "subcategory", "issue_type"]
    st.rerun()

if "reviewed_answer" not in st.session_state:
    reset_chain()

# step 1: categorize
def categorize_question(messages_list, model_to_use = mini_model):
    response = client.chat.completions.create(
        model=model_to_use,
        messages=messages_list,
        response_format={ "type": "json_object" },
        temperature = 0
    )
    temp = response.choices[0].message.content
    categorization = eval(temp)
    for key, value in categorization.items():
        st.session_state[key] = value

    if categorization["category"] == "Non-Biblical Questions":
        temp_dict = {
            "user_question": st.session_state["user_question"],
            "category": categorization["category"],
            "subcategory": categorization["subcategory"]
        }
        st.session_state["refuse"] = True
        st.session_state["refusing_prompt"] = st.session_state["refusing_prompt"].format(**temp_dict)
        st.session_state["4_refusing"] + [{"role": "user", "content": st.session_state["refusing_prompt"]}]
    else:
        categorization["user_question"] = st.session_state["user_question"]
        st.session_state["reasoning_prompt"] = st.session_state["reasoning_prompt"].format(**categorization)

# step 2: reasoning

async def async_response(placeholder, messages_list, model_to_use, agent, temperture=0):
    stream = await async_client.chat.completions.create(
        model=model_to_use,
        messages=messages_list,
        stream=True,
        temperature=temperture
    )
    streamed_text = ""
    async for chunk in stream:
        chunk_content = chunk.choices[0].delta.content
        if chunk_content is not None:
            streamed_text = streamed_text + chunk_content
            placeholder.write(streamed_text)

    if agent == "a":
        st.session_state["first_answer"] = streamed_text
    elif agent == "b":
        st.session_state["second_answer"] = streamed_text
    elif agent == "c":
        st.session_state["third_answer"] = streamed_text

async def reasoning(messages_a, messages_b, messages_c):
    col1, col2, col3 = st.columns(3)

    response_1 = col1.empty()
    response_2 = col2.empty()
    response_3 = col3.empty()

    await asyncio.gather(
        async_response(response_1, messages_a, ft_model, "a"),
        async_response(response_2, messages_b, mini_model, "b"),
        async_response(response_3, messages_c, mini_model, "c")
    )

def main_chain(user_question):
    # step 1: categorize
    st.session_state["user_question"] = user_question
    step_1_prompt = st.session_state["1_caterogizing"] + [{"role": "user", "content": user_question}]
    with st.spinner("Understanding the question..."):
        categorize_question(step_1_prompt)

    if st.session_state["refuse"]:
        answer = ''
        c = st.empty()
        response = chat_functions.get_response(st.session_state["4_refusing"], model_to_use=big_model, stream=True)
        for event in response:
            c.info(answer)
            event_text = event.choices[0].delta.content
            if event_text is not None:
                answer += event_text
        st.session_state["refuse_answer"] = answer
        temp_dict = {key: st.session_state[key] for key in st.session_state["keys_to_save"]}
        temp_dict["reviewed_answer"] = answer
    else:        
        # step 2: reasoning
        with st.expander("Counsel of Three"):
            messages_a = st.session_state["2_reasoning_a"] + [{"role": "user", "content": st.session_state["reasoning_prompt"]}]
            messages_b = st.session_state["2_reasoning_b"] + [{"role": "user", "content": st.session_state["reasoning_prompt"]}]
            messages_c = st.session_state["2_reasoning_c"] + [{"role": "user", "content": st.session_state["reasoning_prompt"]}]
            asyncio.run(reasoning(messages_a, messages_b, messages_c))

        # step 3: review answer
        important_keys = ["user_question", "reformatted_question", "category", "subcategory", "issue_type", "first_answer", "second_answer", "third_answer"]
        temp_dict = {key: st.session_state[key] for key in important_keys}
        st.session_state["answer_prompt"] = st.session_state["answer_prompt"].format(**temp_dict)
        final_prompt = st.session_state["3_reasoning"] + [{"role": "user", "content": st.session_state["answer_prompt"]}]

        answer = ''
        c = st.empty()
        response = chat_functions.get_response(final_prompt, model_to_use=big_model, stream=True)
        for event in response:
            c.info(answer)
            event_text = event.choices[0].delta.content
            if event_text is not None:
                answer += event_text
        st.session_state["reviewed_answer"] = answer
        temp_dict["reviewed_answer"] = answer
        st.session_state["follow_up_prompt"] = st.session_state["follow_up_prompt"].format(**temp_dict)

    # save to database
    Session = sessionmaker(bind=pool)
    session = Session()
    chain_reasoning = ChainReasoning(
        user_question=temp_dict["user_question"],
        reformatted_question=temp_dict["reformatted_question"],
        category=temp_dict["category"],
        subcategory=temp_dict["subcategory"],
        issue_type=temp_dict["issue_type"],
        reviewed_answer=temp_dict["reviewed_answer"],
        language=st.session_state["language"]
    )
    session.add(chain_reasoning)
    session.commit()
    session.close()

    st.rerun()

def follow_up():
    follow_up_messages = st.session_state["parrot_follow_up"] + [{"role": "user", "content": st.session_state["follow_up_prompt"]}]
    answer2 = ''
    c2 = st.empty()
    response = chat_functions.get_response(follow_up_messages, model_to_use=big_model, stream=True)
    for event in response:
        c2.write(answer2)
        event_text = event.choices[0].delta.content
        if event_text is not None:
            answer2 += event_text
    st.session_state["follow_up"] = answer2
    st.rerun()