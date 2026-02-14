export const storyData = {
  title: "The Rickshaw Accident",
  description: "Late afternoon on Shahrah-e-Faisal near Karachi Airport. Rush hour traffic. Hot and humid. A rickshaw and a car have collided, both drivers blaming each other. Horns honking, crowd gathering. Traffic police known to ask for bribe. Everyone wants this over fast but for different reasons.",
  characters: [
    { name: "Saleem", description: "Poor rickshaw driver, sole earner for family of 5. Speaks Urdu-English mix, uses 'bhai' and 'yaar'. Panicked and defensive after minor accident with expensive car.", color: "#FFB74D" },
    { name: "Ahmed Malik", description: "Successful businessman late for international flight. Impatient, entitled. Speaking formally but stressed about missing flight and damage to his car.", color: "#64B5F6" },
    { name: "Constable Raza", description: "15-year traffic police veteran, underpaid and cynical. Just wants to clear traffic and maybe get a 'facilitation fee'. Sees this as everyday nuisance.", color: "#81C784" },
    { name: "Uncle Jameel", description: "Local shopkeeper who witnessed everything. Nosy, loves drama, gives unsolicited advice in thick Urdu accent. Claims to know 'someone in police'.", color: "#F48FB1" }
  ],
  events: [
    { type: "narration", content: "Saleem, the rickshaw driver, is the most likely to break the silence. He's directly involved in the accident and likely feeling the most immediate pressure from the gathering crowd and the approaching police.", turn: 0 },
    { type: "dialogue", speaker: "Saleem", content: "\"Arre yaar! Dekho toh, dekho! Yeh banda, *yeh banda* full speed mein aaya! Main toh slow hi jaa raha tha, Allah ki kasam! Five logon ka pet pala hai mera, bhai! Iski gaadi dekho, kuch hua bhi hai? Meri rickshaw dekho! Sab kuch kharab!\"", turn: 1 },
    { type: "narration", content: "Ahmed Malik, the car driver, bristles at Saleem's accusation and the implication he's wealthy enough not to worry about a dent. He steps out of his car, adjusting his expensive shalwar kameez.", turn: 1 },
    { type: "dialogue", speaker: "Ahmed Malik", content: "\"Five people's stomachs? Is that my concern? Look at the state of *my* vehicle! This is a brand new Mercedes, you understand? A dent like that… the resale value! I have a flight to catch. An *international* flight.\"", turn: 2 },
    { type: "narration", content: "The escalating argument draws the attention of Constable Raza, a weary-looking traffic policeman who slowly weaves his way through the gathering crowd, already calculating potential earnings.", turn: 2 },
    { type: "dialogue", speaker: "Constable Raza", content: "\"Acha, acha, shant ho jao. Sab log chup karo thora. Paperwork hoga, dekhte hain kya hua. *Thora* chai-pani ka kharcha bhi to banta hai, scene dekhte hue.\"", turn: 3 },
    { type: "dialogue", speaker: "Uncle Jameel", content: "\"Aray, aray, aray! Kya nautanki hai yeh? Mercedes wali flight catch karne ki tension mein hai, aur rickshaw wala apne pet ki. Sab ke dukh sunai dete hain, beta. *Main* toh yahan roz dekhta hoon.\"", turn: 5 },
    { type: "dialogue", speaker: "Ahmed Malik", content: "\"Uncle Jameel, with all due respect, I do not have time for 'adjust karna'. Constable, forget the 'chai-pani'. I will pay for the damage – a reasonable amount – *if* we can move this along.\"", turn: 6 },
    { type: "dialogue", speaker: "Constable Raza", content: "\"Five hazaar. Bas. Five hazaar de dijiyega, aur chaliye. Koi tension nahi. Sab khairiyat se.\"", turn: 7 },
    { type: "narration", content: "Ahmed, with a sigh that carried the weight of Karachi itself, pulled out his wallet. Five thousand rupees exchanged hands. The rickshaw was hastily righted, traffic began to inch forward. Life in Karachi continued, a chaotic symphony of survival and compromise.", turn: 7, conclusion: true }
  ]
};

export const storyOutputJson = `{
  "title": "The Rickshaw Accident",
  "seed_story": {
    "title": "The Rickshaw Accident",
    "description": "Late afternoon on Shahrah-e-Faisal..."
  },
  "metadata": {
    "total_turns": 7,
    "conclusion_reason": "Financial settlement reached..."
  },
  "events": [
    {
      "type": "narration",
      "content": "Saleem breaks the silence...",
      "turn": 0
    },
    {
      "type": "dialogue",
      "speaker": "Saleem",
      "content": "Arre yaar! Dekho toh...",
      "turn": 1
    }
  ]
}`;

export const graphNodes = [
  { id: 'director_select', label: 'Director Select', description: 'The Director agent analyzes the current narrative state and selects the next character to speak based on story dynamics.' },
  { id: 'character_reason', label: 'Character Reason', description: 'The selected character uses structured reasoning to decide what to say or do based on personality, memory, and context.' },
  { id: 'process_action', label: 'Process Action', description: 'Character actions (inspect, call police, offer bribe, etc.) are processed and their effects applied to the story state.' },
  { id: 'memory_update', label: 'Memory Update', description: 'Character memories are updated with new facts, emotional states, and relationship changes from the interaction.' },
  { id: 'check_conclusion', label: 'Check Conclusion', description: 'The Director evaluates whether the story has reached a natural conclusion point based on resolution conditions.' },
  { id: 'conclude', label: 'Conclude Story', description: 'The narrative is wrapped up with a final narration summarizing the outcome and character fates.' }
];

export const features = [
  {
    title: "Character Memory",
    description: "Each character maintains a persistent memory of facts, interactions, and emotional states that evolve throughout the narrative.",
    icon: "memory"
  },
  {
    title: "Action System",
    description: "Characters can execute non-verbal actions like inspecting damage, calling police, or offering bribes — not just dialogue.",
    icon: "action"
  },
  {
    title: "Reasoning Layer",
    description: "Structured reasoning through observations, thoughts, and decisions before each character response.",
    icon: "reasoning"
  },
  {
    title: "3-Act Story Arc",
    description: "Stories follow a dramatic Setup → Confrontation → Resolution structure with dynamic tension tracking.",
    icon: "arc"
  },
  {
    title: "Emotion & Relationships",
    description: "Characters have emotional states and inter-character relationships that shift based on story events.",
    icon: "emotion"
  }
];

export const actions = [
  { name: "inspect_damage", icon: "🔍", description: "Character examines physical damage to vehicles or property at the accident scene." },
  { name: "call_police", icon: "📞", description: "Character contacts law enforcement for official intervention and documentation." },
  { name: "offer_bribe", icon: "💰", description: "Character attempts to expedite resolution through unofficial financial incentive." },
  { name: "leave_scene", icon: "🚶", description: "Character attempts to exit the situation, potentially escalating tensions." },
  { name: "take_photo", icon: "📸", description: "Character documents evidence by photographing the scene for records." },
  { name: "gather_crowd", icon: "👥", description: "Character rallies bystanders for support or to apply social pressure." },
  { name: "negotiate", icon: "🤝", description: "Character engages in direct bargaining to reach a mutual agreement." },
  { name: "threaten", icon: "⚠️", description: "Character uses intimidation or warnings to influence the outcome." }
];

export const reasoningExample = {
  character: "Ahmed Malik",
  reasoning: {
    observations: "Rickshaw has minor damage. My Mercedes has a noticeable dent. Crowd is growing. Constable is hinting at bribe. Flight boards in 90 minutes.",
    thoughts: "I cannot afford to miss this flight. The constable will drag this out for money. Paying now is cheaper than missing my deal.",
    emotional_state: "frustrated, anxious, pragmatic",
    decision: "Offer to pay 5000 rupees to settle immediately and leave for airport."
  }
};
