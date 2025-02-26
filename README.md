# Calvinist Parrot

An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.

## Overview

Calvinist Parrot delivers Biblical insights and deep theological responses by combining multiple AI agents and a built-in review process modeled after Reformed theology. Whether you’re exploring doctrine, engaging in a dynamic chat, or seeking daily devotionals, the Parrot is here to guide you.

## What the Parrot Can Do

- **Theological Q&A:** Answers complex theological questions with layered reasoning.
- **Real-Time Chat:** Engage in interactive sessions with streamed responses.
- **Multi-Perspective Insights:** Choose from Reformed Baptist, Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal/Charismatic, or Non-Denominational Evangelical modes.
- **Daily Devotionals:** Get devotionals generated from current news and Scripture.

## Features

- **Multi-Agent Responses:** Synthesizes answers from multiple AI agents.
- **Calvin's Review:** Ensures doctrinal soundness through a “Calvin-style” review.
- **Real-Time Streaming:** Offers a responsive chat experience using state‑of‑the‑art streaming technology.
- **Bible Integration:** Direct citation and commentary on Scripture.
- **User Authentication:** Powered by Appwrite.
- **Database Integration:** Utilizes Prisma for persistent storage.

![Calvinist Parrot](./public/calvinist_parrot.gif)

## Getting Started

### Prerequisites
- Node.js 18.18.0 or higher
- npm
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/calvinist-parrot.git
cd calvinist-parrot
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

* Copy `.env.template` to `.env`
* Fill in required credentials and API keys

4. Run the development server:

```bash
npm run dev
```

## Pages

- **Home Page**  
  Located at `/app/page.tsx`. This is the entry point where users ask theological questions.
  
- **Main Chat Page**  
  Located at `/app/main-chat/[chatId]/page.tsx`. Enables real-time chat sessions with streamed responses.
  
- **Documentation Page**  
  Located at `/app/documentation-parrot-qa/page.tsx`. Provides API documentation and selectable denominational modes.
  
- **Devotional Page**  
  Located at `/app/devotional/page.tsx`. Generates daily devotionals using the latest news and Bible passages.

## API Endpoints

- **/api/parrot-qa**  
  Processes user questions through categorization, multiple agent responses, and synthesizes a final answer.

- **/api/parrot-chat**  
  Handles real-time chat sessions, streaming responses and saving conversation history.

<!-- - **/api/elaborate**  
  Provides follow-up detailed responses (elaboration) based on initial answers and commentary.

- **/api/devotional-generation**  
  Generates daily devotionals by combining news snippets with Scripture in a structured JSON format. -->

## Tech Stack

- Next.js with TypeScript
- OpenAI GPT-4 integration
- Real-Time Streaming with ReadableStream
- Appwrite for user authentication
- Prisma for database management

## Contributing
We welcome contributions! Please see our Contributing Guide for details.

## Acknowledgements
Huge thanks to [AO Lab](https://helloaolab.my.canva.site/) for providing the Bible API with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and Bible Commentaries.

Learn more about the BSB [here](https://copy.church/initiatives/bibles/) and join us in discovering the richness of its text.

## Contact
For questions or support, please [reach out](mailto:jesus@jgmancilla.com).

# Soli Deo Gloria

**"For from Him and through Him and to Him are all things. To Him be the glory forever! Amen."**
- Romans 11:36
