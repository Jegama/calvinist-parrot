import streamlit as st
import parrot_toolkit.parrot_auth as auth
import os

if 'cookie_name' not in st.session_state:
    st.session_state['cookie_name'] = ""

# Check if the user is logged in
if "logged_in" not in st.session_state:
    auth.check_login(st.session_state['cookie_name'])

st.session_state['url'] = os.environ.get('URL')

from parrot_ai import chat_functions
from parrot_ai.core.prompts import QUICK_CHAT_PROMPT
from PIL import Image
from dotenv import load_dotenv
load_dotenv()

parrot = Image.open("app/calvinist_parrot.ico")
calvin = Image.open("app/calvin.ico")


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

ft_model  = os.environ.get("FT_MODEL")

def reset_chat():
    st.session_state["parrot_followup"] = [{"role": "system", "content": QUICK_CHAT_PROMPT}]
    st.session_state["question"] = ""
    st.session_state["first_answer"] = ""
    st.session_state['new_conversation'] = True
    st.rerun()

def update_question():
    # This function will be triggered on text input changes
    st.session_state["question"] = st.session_state["input_question"]

# to show chat history on ui
if "first_answer" not in st.session_state:
    reset_chat()

def homepage():

    st.image("https://cultofthepartyparrot.com/parrots/hd/calvinist_parrot.gif",width=100)
    st.title(HOME_TITLE)

    st.write(HOME_INTRO)

    st.write(QUICK_CHAT_INTRO)

    st.text_input(CHAT_FIRST_MESSAGE, value=st.session_state.get("question", ""), key="input_question", 
                  placeholder=CHAT_PLACESHOLDER, on_change=update_question)

    if st.session_state["first_answer"] != "":
        st.info(st.session_state["first_answer"])
        if st.button(QC_FOLLOW_UP):
            answer2 = ''
            c2 = st.empty()
            prompt = chat_functions.generate_followup_prompt(st.session_state["question"], st.session_state["first_answer"])
            st.session_state["parrot_followup"].append({"role": "user", "content": prompt})
            response = chat_functions.get_response(st.session_state["parrot_followup"])
            for event in response:
                c2.info(answer2)
                event_text = event.choices[0].delta.content
                if event_text is not None:
                    answer2 += event_text

        if st.button(QC_RESET):
            reset_chat()
    else:
        if st.button(QC_BUTTON):
            answer = ''
            c = st.empty()
            response = chat_functions.get_response([{"role": "user", "content": st.session_state["question"]}], model_to_use=ft_model)
            for event in response:
                c.info(answer)
                event_text = event.choices[0].delta.content
                if event_text is not None:
                    answer += event_text
            st.session_state["first_answer"] = answer
            st.rerun()

    st.divider()

    st.write(HOME_MENU_INTRO)

    st.divider()

    st.markdown(HOME_FOOTER, unsafe_allow_html=True)


home = st.Page(homepage, title=f"{pages[0]} v2.8", icon="🦜")

login_page = st.Page("directory/parrot_login.py", title=pages[5], icon=":material/login:")
register_page = st.Page("directory/parrot_register.py", title=pages[6], icon=":material/assignment_ind:")
logout_page = st.Page(auth.logout, title=pages[7], icon=":material/logout:")

v2_parrot = st.Page("directory/Parrot.py", title=pages[0], icon="🦜")
ccel_page = st.Page("directory/CCEL.py", title="CCEL", icon="📚")
study_helper = st.Page("directory/Study_Helper.py", title=pages[1], icon="📖")
devotionals = st.Page("directory/Devotional.py", title=pages[2], icon="📜")
sermon_review = st.Page("directory/Sermon_review.py", title=pages[3], icon="👨‍🏫")
bible_studies = st.Page("directory/Bible_studies.py", title=pages[4], icon="✒️")
nav_tools_eng = [ccel_page, study_helper, sermon_review]
nav_tools_esp = [ccel_page, study_helper]
nav_tools_jegama = [ccel_page, study_helper, sermon_review, bible_studies]

if st.session_state['language'] in ['Español', 'Spanish']:
    nav_tools = nav_tools_esp
else:
    if st.session_state['logged_in']:
        nav_tools = nav_tools_jegama if st.session_state['username'] == 'Jegama' else nav_tools_eng
    else:
        nav_tools = [ccel_page, study_helper]


if st.session_state['logged_in']:
    pg = st.navigation(
        {
            "Main": [v2_parrot, devotionals],
            "Tools": nav_tools,
            "Account": [logout_page],
        }
    )
else:
    pg = st.navigation(
        {
            "Main": [home, login_page, register_page],
            "Tools": nav_tools,
            "Other": [devotionals]
        }
    )

pg.run()