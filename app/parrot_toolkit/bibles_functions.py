import streamlit as st
import pythonbible as bible
import pandas as pd
import os

from openai import OpenAI
client = OpenAI()
gpt_model = os.environ.get("GPT_MODEL")

bibles = pd.read_csv('app/bibles.tsv', sep='\t')

translations = {
    'eng': 'Berean Standard Bible',
    'esp': 'Reina Valera Gomez',
}

version_short = {
    'Berean Standard Bible': 'BSB',
    'Reina Valera Gomez': 'RVG',
}

def get_local_verse_text(verse, language):
    if language in ['Español', 'Spanish']:
        version = translations['esp']
        bible_book = bibles.loc[bibles['Verse'] == verse, 'Libro'].values[0]
    else:
        version = translations['eng']
        bible_book = bibles.loc[bibles['Verse'] == verse, 'Book'].values[0]

    bible_text = bibles.loc[bibles['Verse'] == verse, version].values[0]
    return bible_text, version_short[version], bible_book

def translate_reference(input_reference):
    prompt_create_name = f"""Can you translate this Bible reference from {st.session_state['language']} to English, please?:

---------------------
{input_reference}
---------------------

If it's not a Bible reference, just return the same text.

Please reply in the following JSON format:

{{
    "reference": string \\ Translated Bible reference in English from {st.session_state['language']} if it's a Bible reference, otherwise the same text.
}}

Always return response as JSON."""


    get_name_prompt = [
        {"role": "system", "content": f"You are a helpful assistant that translates Bible references from {st.session_state['language']} to English."}, {"role": "user", "content": prompt_create_name}
    ]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={ "type": "json_object" },
        messages=get_name_prompt,
        temperature = 0
    )
    translated_reference = response.choices[0].message.content
    try:
        translated_reference = eval(translated_reference)['reference']
        return translated_reference
    except Exception as e:
        st.warning("An error occurred while translating the Bible reference. Please try again.")
        print(translated_reference)
        print(e)
        return None


def get_text_ui(verse):
    if st.session_state['language'] in ['Español', 'Spanish']:
        verse = translate_reference(verse)
    references = bible.get_references(verse)
    text_out = ''

    for i in references:
        text_out += '\n'
        verse_id = bible.convert_reference_to_verse_ids(i)
        reference_out = bible.format_scripture_references([i])
        for j in verse_id:
            temp = bible.convert_verse_ids_to_references([j])
            temp_ref = bible.format_scripture_references(temp)
            try:
                verse_text, version, bible_book = get_local_verse_text(temp_ref, st.session_state['language'])
                text_out += f'{verse_text} '
            except Exception as e:
                text_out += f'{bible.get_verse_text(j)}  '
                version = 'ASV'
        text_out = text_out[:-1]
        if st.session_state['language'] in ['Español', 'Spanish']:
            reference_out = f"{bible_book} {reference_out.split(' ')[-1]}"
        text_out += f' - {reference_out} ({version}) \n'

    return text_out, version, reference_out