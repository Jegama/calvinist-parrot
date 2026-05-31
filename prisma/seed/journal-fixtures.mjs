const TEST_USER = {
  id: "cmptnrtw60001ndencxkjhp3p",
  appwriteUserId: "6a12dbce0025c3f5dbb1",
  displayName: "Test",
  email: "test@test.com",
  createdAt: new Date("2026-05-31T10:50:17.238Z"),
};

const MODEL_INFO = {
  call2Model: "gemini-3-flash-preview",
  call1aModel: "gemini-3-flash-preview",
  call1bModel: "gemini-3-flash-preview",
  call1cModel: "gemini-3-flash-preview",
  promptVersion: "1.0.0-9fc32452",
};

const JOURNAL_FIXTURES = [
  {
    id: "cmptnsa8d0002nden1exmi1px",
    entryDate: new Date("2026-05-31T10:50:38.412Z"),
    entryText: `Answered prayer today. A friend I have been sharing the gospel with asked if we could read the Bible together next week. I feel thankful and surprised, and I want to respond wisely.`,
    tags: [
      "circumstance:Friendship",
      "virtue:Gratitude",
      "theologicalTheme:Wisdom",
      "meansOfGrace:Scripture",
    ],
    createdAt: new Date("2026-05-31T10:50:38.413Z"),
    updatedAt: new Date("2026-05-31T10:50:54.846Z"),
    aiOutput: {
      id: "cmptnsmwo0003ndenl8657jwc",
      createdAt: new Date("2026-05-31T10:50:54.840Z"),
      call1: {
        title: "God Opens a Door for Outreach",
        scripture: [
          {
            reference: "Psalm 103:1-2",
            whyItApplies: "You are encouraged to praise the Lord with all your soul and not forget his kindness in opening your friend's heart to the Word.",
          },
          {
            reference: "Colossians 4:2-4",
            whyItApplies: "This passage reminds you to continue in prayer and ask God to open a door for the word so that you may make the gospel clear as you read together.",
          },
          {
            reference: "1 Corinthians 15:10",
            whyItApplies: "You can find rest knowing that while you work hard to share the gospel, it is the grace of God with you that brings about the growth.",
          },
        ],
        putOffPutOn: [
          {
            putOn: "Put on a restful confidence in the power of the word of God to work in your friend's heart (Isaiah 55:10-11).",
            putOff: "Put off the temptation to rely on your own preparation or persuasiveness as you plan for your meeting (Proverbs 3:5-6).",
          },
        ],
        safetyFlags: [],
        heartReflection: [
          "It might be worth considering that because you wrote 'I feel thankful and surprised,' you may be wanting to express genuine praise for God's kindness in answering your prayers (Psalm 103:1-5).",
          "It might be worth considering that because you wrote 'I want to respond wisely,' you may be wanting to handle the word of truth with the care and reverence it deserves (2 Timothy 2:15-16).",
        ],
        situationSummary: "A friend you have been sharing the Gospel with has invited you to read Scripture together next week. You feel both thankful and surprised by this development. You are now seeking to respond with wisdom as you prepare for this opportunity.",
        oneSentenceSummary: "You are expressing gratitude to God for an answered prayer after a friend asked to read the Bible with you.",
        practicalNextSteps: [
          "Set aside time this week to pray specifically for your friend's understanding and for the Holy Spirit to give you clarity and gentleness during your meeting.",
          "Select a gospel or a short book like John or Mark to read through together so that your friend can see the life and work of Jesus clearly.",
          "Ask your friend if there are specific questions or topics they are curious about to help you prepare thoughtfully for your time together.",
        ],
      },
      call2: {
        tags: {
          virtue: ["Gratitude"],
          heartIssue: [],
          circumstance: ["Friendship"],
          meansOfGrace: ["Scripture"],
          rulingDesire: [],
          theologicalTheme: ["Wisdom"],
        },
        dashboardSignals: {
          recurringTheme: "Friendship",
        },
        suggestedPrayerRequests: [
          {
            notes: "Consider praying for wisdom and clarity as you prepare to read the Bible with your friend for the first time. You could ask for the Holy Spirit to guide your conversation and help you explain the gospel clearly.",
            title: "Wisdom for Bible study with friend",
            linkedScripture: "James 1:5",
          },
          {
            notes: "A prayer request could be that God would open your friend's heart to understand and believe the truths you read together. You might ask that the Word of God would take root in their life.",
            title: "Softened heart for your friend",
            linkedScripture: "Acts 16:14",
          },
          {
            notes: "Consider praying for the right balance of boldness and gentleness as you share your faith. You could ask God for the ability to answer any questions your friend may have with grace.",
            title: "Boldness and gentleness in witness",
            linkedScripture: "1 Peter 3:15",
          },
        ],
      },
    },
  },
  {
    id: "cmptnt17a0004ndenub3kwfy1",
    entryDate: new Date("2026-05-31T10:51:13.365Z"),
    entryText: `I have been more consistent in reading Scripture in the mornings for the last two weeks, even when I do not feel like it. I am noticing a little more patience with my family, and I have been quicker to confess when I snap. I am encouraged, but I am also afraid I will lose momentum. I want this to be real growth, not just a good streak.`,
    tags: [
      "circumstance:Rest",
      "circumstance:Time stewardship",
      "heartIssue:Fear",
      "virtue:Patience",
      "virtue:Diligence",
      "theologicalTheme:Sanctification",
      "meansOfGrace:Scripture",
      "meansOfGrace:Confession",
    ],
    createdAt: new Date("2026-05-31T10:51:13.366Z"),
    updatedAt: new Date("2026-05-31T10:51:19.492Z"),
    aiOutput: {
      id: "cmptnt5xc0005ndenv20r7bcm",
      createdAt: new Date("2026-05-31T10:51:19.488Z"),
      call1: {
        title: "Finding Encouragement in Faithful Rhythms",
        scripture: [
          {
            reference: "Philippians 1:6",
            whyItApplies: "You can find rest in the promise that God is the one who began this good work in you and He is faithful to carry it to completion regardless of your feelings.",
          },
          {
            reference: "Galatians 6:9",
            whyItApplies: "This passage encourages you to persevere in the habit of seeking God even when you feel tired, knowing that your consistency is a way of sowing to the Spirit.",
          },
          {
            reference: "1 Thessalonians 5:24",
            whyItApplies: "This verse shifts your focus from your own ability to maintain momentum to the character of God who is faithful to sustain your growth.",
          },
        ],
        putOffPutOn: [
          {
            putOn: "Put on a humble dependence on the Holy Spirit who began this good work in you and will be faithful to complete it (Philippians 1:6).",
            putOff: "Put off the temptation to fear that your spiritual growth depends on your ability to maintain a streak or keep up momentum (Galatians 3:3).",
          },
          {
            putOn: "Put on a heart of thanksgiving, acknowledging that every good gift and every bit of patience you show is a result of God's kindness toward you (James 1:17).",
            putOff: "Put off drifting toward self-reliance or pride in your recent consistency and improvements in character (1 Corinthians 4:7).",
          },
        ],
        safetyFlags: [],
        heartReflection: [
          "It might be worth considering that because you wrote about being afraid you will lose momentum, you may be tempted to rely on your own strength rather than resting in the sustaining grace of God described in Philippians 1:6.",
          "It might be worth considering that since you mentioned wanting this to be real growth and not just a good streak, you may be equating your spiritual standing with your performance rather than with your identity in Christ.",
          "It might be worth considering that because you are noticing more patience and quicker confession, your heart is being sensitized by the Holy Spirit to the value of peace and reconciliation within your home as seen in Colossians 3:12-15.",
        ],
        situationSummary: "You have maintained a two-week habit of morning Scripture reading and are seeing God work through increased patience and a quicker heart to confess sin to your family. While you are encouraged by these changes, you also feel a sense of trepidation about whether this momentum will last or if it is merely a temporary phase.",
        oneSentenceSummary: "You are experiencing the fruit of consistent time in God's Word while processing a cautious hope for continued growth in your heart and home.",
        practicalNextSteps: [
          "Thank God for the specific evidence of grace you have seen in your increased patience and your quicker heart to confess sin to your family.",
          "Share your desire for continued consistency with a trusted friend or your spouse, asking them to pray that your heart would remain dependent on Christ rather than your own efforts.",
          "When you feel your momentum lagging, continue to show up for your morning reading as an act of trust in God's word rather than a performance to maintain a streak.",
        ],
      },
      call2: {
        tags: {
          virtue: ["Patience", "Diligence"],
          heartIssue: ["Fear"],
          circumstance: ["Rest", "Time stewardship"],
          meansOfGrace: ["Scripture", "Confession"],
          rulingDesire: [],
          theologicalTheme: ["Sanctification"],
        },
        dashboardSignals: {
          recurringTheme: "Sanctification",
        },
        suggestedPrayerRequests: [
          {
            notes: "Consider praying for continued discipline and strength to persist in your morning Scripture reading even when you lack emotional motivation.",
            title: "Stability and Consistency in Spiritual Disciplines",
            linkedScripture: "Psalm 119:105-107",
          },
          {
            notes: "A prayer request could be for the Holy Spirit to continue cultivating patience and for the humility to remain quick in confessing your faults to your family.",
            title: "Growing Patience within Your Family Relationships",
            linkedScripture: "Colossians 3:12-13",
          },
          {
            notes: "You might pray for peace regarding your fears of losing momentum, trusting that it is God who began a good work in you and will bring it to completion.",
            title: "Confidence in God's Work of Sanctification",
            linkedScripture: "Philippians 1:6",
          },
        ],
      },
    },
  },
  {
    id: "cmptntvkh0006ndenbwbsucxf",
    entryDate: new Date("2026-05-31T10:51:52.720Z"),
    entryText: `Bedtime has become a daily battle with my son. He stalls, argues, and whines, and I can feel myself getting harsher as the minutes pass. Last night I raised my voice and threatened consequences I was not ready to follow through on. He finally went quiet, but it felt like I "won" by intimidation, and I hated that. Afterward I felt guilty and discouraged. I want to shepherd his heart, not just control behavior, but I also need practical help because evenings are exhausting. I think I want comfort and quiet more than I want to patiently disciple him, and that scares me.`,
    tags: [
      "circumstance:Parenting",
      "heartIssue:Anger",
      "heartIssue:Shame",
      "rulingDesire:Comfort",
      "rulingDesire:Control",
      "virtue:Patience",
      "theologicalTheme:Sanctification",
    ],
    createdAt: new Date("2026-05-31T10:51:52.721Z"),
    updatedAt: new Date("2026-05-31T10:51:58.614Z"),
    aiOutput: {
      id: "cmptnu0400007ndeno5tg825y",
      createdAt: new Date("2026-05-31T10:51:58.608Z"),
      call1: {
        title: "Shepherding Hearts Amidst Bedtime Battles",
        scripture: [
          {
            reference: "Ephesians 6:4",
            whyItApplies: "This passage reminds you to avoid provoking your son to anger through harshness and instead focus on his upbringing in the instruction of the Lord.",
          },
          {
            reference: "James 1:19-20",
            whyItApplies: "You are encouraged to be quick to hear and slow to anger because human anger does not produce the righteousness that God requires for your parenting.",
          },
          {
            reference: "Philippians 1:6",
            whyItApplies: "God promises to continue the good work of sanctification He has started in you, giving you hope that your current progress in patience is not temporary.",
          },
        ],
        putOffPutOn: [
          {
            putOn: "Put on the practice of responding with a soft answer that turns away wrath, choosing to discipline with calm and consistent consequences (Proverbs 15:1).",
            putOff: "Put off the habit of provoking your child to anger by using harsh tones or empty threats to gain control (Ephesians 6:4).",
          },
          {
            putOn: "Put on a shepherd's heart that views the exhausting evening hours as a primary mission field for teaching your son the value of obedience (Proverbs 22:6).",
            putOff: "Put off the selfish desire for personal ease that views your son's stalls and arguments as an interruption to your comfort (Philippians 2:3-4).",
          },
          {
            putOn: "Put on a humble dependence on Christ's strength, trusting that He who began a good work in you will continue to perfect it even after a difficult night (Philippians 1:6).",
            putOff: "Put off the discouragement that leads you to believe your growth is merely a phase or that you have failed beyond God's grace (Lamentations 3:22-23).",
          },
        ],
        safetyFlags: [],
        heartReflection: [
          "It might be worth considering that because you wrote you want comfort and quiet, your anger may be a response to your son being an obstacle to your own rest rather than an opportunity for his discipleship.",
          "It might be worth considering that because you used intimidation to win the battle, you may be tempted to value immediate outward compliance over the slow work of heart-level shepherding described in Deuteronomy 6:6-7.",
          "It might be worth considering that because you felt guilty and discouraged afterward, you are experiencing the kindness of the Holy Spirit prompting you toward the godly grief that leads to repentance as mentioned in 2 Corinthians 7:10.",
        ],
        situationSummary: "Your evening routine has become a source of conflict as your son stalls and argues, leading you to use intimidation and raised voices to gain compliance. You recognized that your desire for personal comfort was outweighing your patience, and you are now seeking a way to discipline him with grace rather than anger.",
        oneSentenceSummary: "You are struggling with feelings of guilt and exhaustion after responding harshly to your son's bedtime stalling, prompting a desire to move from behavior control to heart-level discipleship.",
        practicalNextSteps: [
          "Apologize to your son for your harsh tone and explain that you want to help him obey God rather than just winning an argument.",
          "Sit down with your son during a calm time of day to establish clear, consistent consequences for stalling so you do not have to invent them in a moment of frustration.",
          "Pray specifically before the bedtime routine starts, asking God to help you value your son's heart more than your own desire for quiet comfort.",
        ],
      },
      call2: {
        tags: {
          virtue: ["Patience"],
          heartIssue: ["Anger", "Shame"],
          circumstance: ["Parenting"],
          meansOfGrace: [],
          rulingDesire: ["Comfort", "Control"],
          theologicalTheme: ["Sanctification"],
        },
        dashboardSignals: {
          recurringTheme: "Parenting",
        },
        suggestedPrayerRequests: [
          {
            notes: "Consider praying for the strength to respond with gentleness rather than harshness when your son stalls at bedtime. You could ask for the ability to remain calm even when you are physically and mentally exhausted.",
            title: "Patience during difficult parenting moments",
            linkedScripture: "James 1:19-20",
          },
          {
            notes: "A prayer request could be for a shift in your perspective from simply wanting a quiet evening to desiring the spiritual growth of your son. You might ask for wisdom in how to shepherd his heart during these daily battles.",
            title: "Seeking heart discipleship over behavior control",
            linkedScripture: "Ephesians 6:4",
          },
          {
            notes: "Consider praying about the guilt you feel after reacting in anger, asking for the grace to move forward in the light of forgiveness. You can ask God to help you value patient discipleship over your own desire for personal comfort.",
            title: "Repentance and relief from guilt",
            linkedScripture: "1 John 1:9",
          },
        ],
      },
    },
  },
  {
    id: "cmptnujcy0008ndenu94o0i79",
    entryDate: new Date("2026-05-31T10:52:23.553Z"),
    entryText: `Yesterday at work I felt cornered in a meeting. My manager criticized my timeline in front of everyone, and I could feel my face get hot. On the outside I stayed calm, but inside I was replaying it and wanting to defend myself. Later I sent a message that sounded polite, but I was trying to prove I was right. I noticed I kept checking Slack to see if people agreed with me. I am worried I care too much about approval, and I feel bitter. I also feel tired and discouraged, like my efforts never matter. I do not want to be driven by fear of man, but I do not know how to change in the moment.`,
    tags: [
      "circumstance:Work",
      "heartIssue:Fear",
      "heartIssue:Bitterness",
      "rulingDesire:Approval",
    ],
    createdAt: new Date("2026-05-31T10:52:23.554Z"),
    updatedAt: new Date("2026-05-31T10:52:29.772Z"),
    aiOutput: {
      id: "cmptnuo5k0009ndenl2ljz2cz",
      createdAt: new Date("2026-05-31T10:52:29.768Z"),
      call1: {
        title: "Seeking Approval and Peace in Conflict",
        scripture: [
          {
            reference: "Proverbs 29:25",
            whyItApplies: "This passage highlights how the fear of man can become a trap for you, while trusting in the Lord provides a secure refuge from the need for others' approval.",
          },
          {
            reference: "Colossians 3:23-24",
            whyItApplies: "These verses encourage you to shift your focus toward working for the Lord rather than for human recognition, knowing that your true reward comes from Christ.",
          },
          {
            reference: "1 Peter 5:6-7",
            whyItApplies: "You can humble yourself under God's hand and cast your anxieties about your reputation on Him, because He cares for you more than any manager or colleague could.",
          },
        ],
        putOffPutOn: [
          {
            putOn: "Put on a humble willingness to listen and evaluate criticism objectively, trusting that God is your ultimate judge and defender (1 Peter 2:23).",
            putOff: "Put off the self-protective desire to vindicate yourself and prove your correctness when criticized (Proverbs 12:15).",
          },
          {
            putOn: "Put on a settled rest in your identity as God's beloved child, seeking to please Him above all others in your work (Ephesians 6:6-7).",
            putOff: "Put off the anxious obsession with human approval and the constant monitoring of others' opinions (Galatians 1:10).",
          },
          {
            putOn: "Put on a heart of thankfulness for the opportunity to serve, remembering that your true reward comes from the Lord (Colossians 3:24).",
            putOff: "Put off the bitterness and discouragement that arises when your hard work goes unappreciated by your manager (Hebrews 12:15).",
          },
        ],
        safetyFlags: [],
        heartReflection: [
          "It might be worth considering that because you wrote about wanting to prove you were right in your message, you may be seeking your righteousness in your workplace performance rather than in Christ as described in Philippians 3:8-9.",
          "It might be worth considering that because you kept checking for agreement on Slack, your heart may be functionalizing the approval of others as a source of safety and worth instead of trusting in God's assessment of you as noted in Proverbs 29:25.",
          "It might be worth considering that because you feel your efforts never matter, you may be tempted to believe that your labor is only valuable if it is recognized by men rather than being done for the Lord as taught in Colossians 3:23-24.",
        ],
        situationSummary: "During a workplace meeting, your manager criticized your project timeline, leading you to feel defensive and anxious for the approval of your colleagues. Although you maintained a calm exterior, you later sent a message aimed at proving your correctness and found yourself dwelling on the opinions of others.",
        oneSentenceSummary: "You are reflecting on your internal struggle with bitterness and the fear of man after experiencing public criticism from your manager.",
        practicalNextSteps: [
          "Identify one specific piece of feedback from your manager that you can humbly act on, regardless of how it was delivered, to practice prioritizing growth over self-defense.",
          "Set a specific time to pray about your desire for workplace approval, asking God to help you find your security in your identity in Christ instead of your professional reputation.",
          "The next time you feel your face get hot in a meeting, pause to silently remind yourself that God sees your work and loves you, which can help you listen without needing to prove yourself.",
        ],
      },
      call2: {
        tags: {
          virtue: [],
          heartIssue: ["Fear", "Bitterness"],
          circumstance: ["Work"],
          meansOfGrace: [],
          rulingDesire: ["Approval"],
          theologicalTheme: [],
        },
        dashboardSignals: {
          recurringTheme: "Approval",
        },
        suggestedPrayerRequests: [
          {
            notes: "Consider praying for a heart that finds its ultimate security in God's acceptance rather than the approval of colleagues or managers.",
            title: "Seeking approval from God alone",
            linkedScripture: "Galatians 1:10",
          },
          {
            notes: "A prayer request could be for the ability to process public correction without bitterness or the immediate need to defend your reputation.",
            title: "Responding to criticism with humility",
            linkedScripture: "Proverbs 15:31-33",
          },
          {
            notes: "You might pray for comfort when your efforts feel unnoticed, remembering that your value is rooted in your union with Christ.",
            title: "Resting in Christ's finished work",
            linkedScripture: "Colossians 3:23-24",
          },
        ],
      },
    },
  },
];

export async function seedDevUserFixtures(prisma) {
  const profile = await prisma.userProfile.upsert({
    where: { appwriteUserId: TEST_USER.appwriteUserId },
    create: {
      id: TEST_USER.id,
      appwriteUserId: TEST_USER.appwriteUserId,
      displayName: TEST_USER.displayName,
      email: TEST_USER.email,
      denomination: "reformed-baptist",
      preferredDepth: "concise",
      ministryContext: [],
      churchInvolvement: null,
      createdAt: TEST_USER.createdAt,
      lastSeenAt: TEST_USER.createdAt,
    },
    update: {
      displayName: TEST_USER.displayName,
      email: TEST_USER.email,
      denomination: "reformed-baptist",
      preferredDepth: "concise",
      ministryContext: [],
      churchInvolvement: null,
      lastSeenAt: new Date(),
    },
  });

  for (const fixture of JOURNAL_FIXTURES) {
    const entry = await prisma.journalEntry.upsert({
      where: { id: fixture.id },
      create: {
        id: fixture.id,
        authorProfileId: profile.id,
        spaceId: null,
        entryDate: fixture.entryDate,
        entryText: fixture.entryText,
        entryType: "PERSONAL",
        category: null,
        subjectMemberId: null,
        gospelConnection: null,
        tags: fixture.tags,
        createdAt: fixture.createdAt,
        updatedAt: fixture.updatedAt,
      },
      update: {
        authorProfileId: profile.id,
        spaceId: null,
        entryDate: fixture.entryDate,
        entryText: fixture.entryText,
        entryType: "PERSONAL",
        category: null,
        subjectMemberId: null,
        gospelConnection: null,
        tags: fixture.tags,
      },
    });

    await prisma.journalEntryAI.upsert({
      where: { entryId: entry.id },
      create: {
        id: fixture.aiOutput.id,
        entryId: entry.id,
        call1: fixture.aiOutput.call1,
        call2: fixture.aiOutput.call2,
        modelInfo: MODEL_INFO,
        createdAt: fixture.aiOutput.createdAt,
      },
      update: {
        call1: fixture.aiOutput.call1,
        call2: fixture.aiOutput.call2,
        modelInfo: MODEL_INFO,
      },
    });
  }

  const journalEntriesCount = await prisma.journalEntry.count({
    where: {
      authorProfileId: profile.id,
      entryType: "PERSONAL",
    },
  });

  await prisma.userProfile.update({
    where: { id: profile.id },
    data: { journalEntriesCount },
  });

  return {
    fixtureCount: JOURNAL_FIXTURES.length,
    journalEntriesCount,
    profile,
  };
}

