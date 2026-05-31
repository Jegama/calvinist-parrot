<div align="center">
    <a href="https://www.calvinistparrotministries.org">
        <img src="./public/LogoForHeader.png" alt="Calvinist Parrot Ministries" height="140" />
    </a>
</div>

# Calvinist Parrot

An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.

[**Website**](https://www.calvinistparrot.com/)

This work is part of the [Calvinist Parrot Ministries](https://www.calvinistparrotministries.org/), we exist to glorify God by creating and freely distributing AI tools that proclaim the Gospel, strengthen the Church, and equip believers across the globe.

## Overview

Calvinist Parrot delivers Biblical insights and deep theological responses by combining multiple AI agents and a built-in review process modeled after Reformed theology. Whether you're exploring doctrine, engaging in a dynamic chat, or seeking daily devotionals, the Parrot is here to guide you.

## What the Parrot Can Do

- **Real-Time Chat:** Engage in interactive sessions with streamed responses.
- **Theological Q&A:** Answers complex theological questions with layered reasoning.
- **Multi-Perspective Insights:** Choose from Reformed Baptist, Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal/Charismatic, or Non-Denominational Evangelical modes.
- **Daily Devotionals:** Get devotionals generated from current news and Scripture.
- **Personal Journal:** Daily reflections with pastoral insight. Each entry receives AI-powered guidance grounded in Scripture, identifying heart issues, suggesting "put off/put on" patterns from Ephesians 4, and offering practical next steps. Journal insights can be promoted to Prayer Tracker requests or continued in deeper conversation.
- **Heritage Journal:** Building faith with your children. Track annual discipleship plans, monthly vision, and daily parenting moments (nurture and admonition) with AI-powered shepherding guidance to help you intentionally disciple your kids.
- **Prayer Tracker:** Organize your prayer life with rotating prayer assignments, personal and family prayer requests, and prayer journals—designed to help you pray consistently for your household and broader faith community.
- **Church Finder:** Discover biblically sound churches with AI-powered doctrinal evaluations. Each church is analyzed for adherence to essential Christian doctrines, historic Reformed confessions, and theological soundness to help you find a faithful congregation.
 - **AI Model Evaluation Dashboard:** See how different AI models perform on doctrinal fidelity, kindness and gentleness, and interfaith sensitivity using the built-in evaluation dashboard at `/llm-evaluation-dashboard`.

## Getting Started

### Prerequisites
- Node.js 20.9.0 or higher. The repo includes an `.nvmrc`.
- npm
- Git
- Docker, for the local Postgres database

### Environment Setup

1. **Fork this repository**

- Click the "Fork" button in the top right
- Follow the prompts to create your fork

2. **Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/calvinist-parrot.git
cd calvinist-parrot
```

3. **Install dependencies**

```bash
npm install
```

4. **Environment variables and local database**

* Copy `.env.template` to `.env`
* Keep the local `DATABASE_URL` pointed at Docker
* Fill in required credentials and API keys
  * `CCEL_URL` is separate from the app database and should point to a PGVector store that holds the `data_ccel_vector_store` table used for CCEL retrieval

5. **Start the local database and apply migrations**

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

The seed adds the app database profile and starter journal fixtures for `test@test.com`, plus starter Church Finder records.

6. **Run the development server**

```bash
npm run dev
```

You can also use `npm run dev:local` to start Docker, apply migrations, seed local fixtures, and launch Next.js in one command.

For the database workflow, CI/CD notes, and testing recommendations, see [Local Development](./docs/technical/Local%20Development.md).

## API Endpoints

### Core Features

- **/api/parrot-qa**  
  Classic Calvinist Parrot Q&A pipeline that categorizes the question, gathers three model answers, runs a Calvin style review, and then streams back a brief synthesized answer using the original legacy guardrails.

- **/api/parrot-chat**  
  Recommended default chat endpoint that powers the main site experience, using the newer LangGraph agent to stream responses and save conversation history while enforcing the current doctrinal and tone guardrails.

### Church Finder

- **/api/churches**  
  List and create churches with AI-powered doctrinal evaluation (GET/POST).

- **/api/churches/[id]**  
  Retrieve detailed church information including evaluation history.

- **/api/churches/check**  
  Verify if a church already exists in the database by website URL.

- **/api/churches/meta**  
  Get filter metadata (states, denominations, totals) for church discovery.

## Contributing
We welcome contributions! Please see our Contributing Guide for details.

## Acknowledgements
Huge thanks to [AO Lab](https://www.helloao.org/) for providing the Bible API with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and Bible Commentaries.

If you want to learn the legal restrictions to sharing God's word, click [here](https://copy.church/initiatives/bibles/).

## Contact
For questions or support, please [reach out](mailto:contact@calvinistparrotministries.org).

# Soli Deo Gloria

**"For from Him and through Him and to Him are all things. To Him be the glory forever! Amen."**
- Romans 11:36

<div align="center">
  <a href="https://copy.church/explain/importance/">
    <img src="https://copy.church/badges/lcc_alt_pde.png" alt="Copy.church" height="100" />
  </a>
  <a href="https://sellingJesus.org/free">
    <img src="https://copy.church/badges/sj_standard_pd.png" alt="sellingJesus.org/free" height="100" />
  </a>
</div>
