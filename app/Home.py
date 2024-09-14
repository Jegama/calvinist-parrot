import streamlit as st
import parrot_toolkit.parrot_auth as auth
import parrot_toolkit.bibles_functions as bf
import os, re

if 'cookie_name' not in st.session_state:
    st.session_state['cookie_name'] = ""

# Check if the user is logged in
if "logged_in" not in st.session_state:
    auth.check_login(st.session_state['cookie_name'])

st.session_state['url'] = os.environ.get('URL')

from parrot_ai import chain_reasoning as cr
from dotenv import load_dotenv
load_dotenv()

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

def update_question():
    # This function will be triggered on text input changes
    st.session_state["question"] = st.session_state["input_question"]

def homepage():

    st.image("https://cultofthepartyparrot.com/parrots/hd/calvinist_parrot.gif",width=100)
    st.title(HOME_TITLE)

    st.write(QUICK_CHAT_INTRO)

    st.text_input(CHAT_FIRST_MESSAGE, value=st.session_state.get("question", ""), key="input_question", 
                  placeholder=CHAT_PLACESHOLDER, on_change=update_question)

    if st.session_state["reviewed_answer"] != "":
        with st.expander("Suggested Answers"):
            col1, col2 = st.columns(2)
            col1.write(st.session_state["first_answer"])
            col2.write(st.session_state["second_answer"])

        st.info(st.session_state["reviewed_answer"])
        references = re.findall(r'\((.*?)\)', st.session_state["reviewed_answer"])
        if len(references) > 0:
            text, _, _ = bf.get_text_ui(references[-1])
            with st.expander(QUOTED_VERSES):
                st.write(text)

        if st.button(QC_FOLLOW_UP):
            cr.follow_up()

        if st.session_state["follow_up"] != "":
            st.write(st.session_state["follow_up"])

        if st.button(QC_RESET):
            cr.reset_chain()
    else:
        if st.button(QC_BUTTON):
            cr.main_chain(st.session_state["question"])

home = st.Page(homepage, title="Home", icon="🏠")

login_page = st.Page("directory/parrot_login.py", title=pages[5], icon=":material/login:")
register_page = st.Page("directory/parrot_register.py", title=pages[6], icon=":material/assignment_ind:")
logout_page = st.Page(auth.logout, title=pages[7], icon=":material/logout:")

v2_parrot = st.Page("directory/Parrot.py", title=f"{pages[0]} v2.8", icon="🦜")
ccel_page = st.Page("directory/CCEL.py", title="CCEL", icon="📚")
study_helper = st.Page("directory/Study_Helper.py", title=pages[1], icon="📖")
devotionals = st.Page("directory/Devotional.py", title=pages[2], icon="📜")
sermon_review = st.Page("directory/Sermon_review.py", title=pages[3], icon="👨‍🏫")
bible_studies = st.Page("directory/Bible_studies.py", title=pages[4], icon="✒️")
about_page = st.Page("directory/About.py", title=pages[8], icon=":material/info:")

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
            "Main": [home, v2_parrot, devotionals],
            "Tools": nav_tools,
            "Other": [about_page],
            "Account": [logout_page],
        }
    )
else:
    pg = st.navigation(
        {
            "Main": [home, v2_parrot, login_page, register_page],
            "Tools": nav_tools,
            "Other": [devotionals, about_page]
        }
    )

pg.run()