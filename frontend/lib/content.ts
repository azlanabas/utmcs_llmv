// ALL teaching prose lives here. There is no CMS (docs/cms_schema.md).
// Edit this file, then rebuild the frontend (docs/handover.md §3.3).

export const brief = {
  what: `This is a local LLM quantization inference benchmark. A single open-weight model — Llama 3.2, with about a billion parameters — is run at three levels of compression (2-bit, 4-bit and 8-bit) through Ollama, entirely on one machine: an Apple M4 Mac with 16 GB of unified memory. Nothing is sent to a cloud API. The model files sit on that laptop's disk, load into its memory, and generate text on its GPU.`,

  how: `The same model and the same three prompts are used at every compression level. The prompts are deliberately different lengths — roughly 20, 200 and 800 tokens — because prompt length and generation speed stress different parts of the machinery. Each prompt runs three times at each level and the results are averaged, to smooth out noise. Before each level's measurements begin, one generation is run and thrown away, so that the numbers measure inference rather than the cost of loading a file from disk. Between levels the model is explicitly evicted from memory, so each level's memory reading is its own. For every run we record time to the first token, total wall-clock time, tokens generated per second, the memory the model occupies while loaded, and its size on disk.`,

  why: `Most people meet language models through an API: you send text, you get text, and everything in between is somebody else's problem. This project goes one layer down, into the serving machinery itself — how a model is compressed to fit on consumer hardware, what that compression costs you, how memory behaves while the model is loaded, and where the time actually goes when a model answers. It is groundwork. Understanding why an 8-bit model is slower than a 2-bit one, and why the wait before the first word behaves differently from the speed of the words after it, is the sort of thing you need before making sensible decisions about larger AI infrastructure.`,
}

export interface Concept {
  term: string
  plain: string
  here: string
}

// The 12 terms the spec requires. Rule: no term is defined using another
// undefined term from this list.
export const concepts: Concept[] = [
  {
    term: 'LLM (large language model)',
    plain: 'A program that has read an enormous amount of text and learned to predict what word is likely to come next. Chain those predictions together and it writes sentences.',
    here: 'The model measured here is Llama 3.2, at roughly one billion learned numbers.',
  },
  {
    term: 'Transformer',
    plain: 'The particular design almost every modern language model is built on. Its key trick is letting every word in the input look at every other word when deciding what matters.',
    here: 'Llama 3.2 is a transformer. Its design is identical at all three compression levels — only the precision of its numbers changes.',
  },
  {
    term: 'Inference',
    plain: 'Actually using a trained model to produce an answer, as opposed to training it in the first place. Training happens once and costs a fortune; inference happens every time someone asks a question.',
    here: 'Everything on this site measures inference. No training happens anywhere in this project.',
  },
  {
    term: 'Quantization',
    plain: 'Storing the model\'s numbers less precisely so the model takes up less space and runs faster — like saving a photo at lower quality. 8-bit keeps more precision than 4-bit, which keeps more than 2-bit.',
    here: 'The whole point of the benchmark: the same model at 2-bit, 4-bit and 8-bit, measured side by side.',
  },
  {
    term: 'Parameters',
    plain: 'The numbers a model learned during training. They are the model. "One billion parameters" means a billion such numbers, and quantization is about how precisely each one is written down.',
    here: 'One billion parameters stored 2, 4, or 8 bits each is most of why the three files differ in size.',
  },
  {
    term: 'Token',
    plain: 'The chunk of text a model actually works with — usually a short word or a piece of one. Roughly three tokens for every four English words.',
    here: 'Speed here is counted in tokens per second, not words per second.',
  },
  {
    term: 'Context window',
    plain: 'The maximum amount of text a model can hold in view at once — everything you sent plus everything it has written so far. Past that limit, the earliest material has to fall away.',
    here: 'The three test prompts are deliberately short, medium and long to push differently against this.',
  },
  {
    term: 'Attention',
    plain: 'The mechanism that lets the model weigh which earlier pieces of text matter when producing the next one. It is what makes a model able to keep a thread rather than just continue plausibly.',
    here: 'Attention is why a long prompt costs more before the first word appears — every earlier piece has to be considered.',
  },
  {
    term: 'KV cache',
    plain: 'A scratchpad the model keeps while writing, holding its work-so-far about the text it has already seen, so it does not redo that work for every new word. It grows as the answer grows, and it lives in memory.',
    here: 'Part of why memory use rises during a long generation, not just when the model is first loaded.',
  },
  {
    term: 'Time to first token (TTFT)',
    plain: 'How long you wait between pressing send and the first word appearing. This is what makes a system feel responsive or sluggish.',
    here: 'Measured for every run. Notably, it barely changes across the three compression levels — but it does change with prompt length.',
  },
  {
    term: 'Tokens per second',
    plain: 'How fast the answer streams once it has started. Separate from the initial wait — a system can start quickly and then produce text slowly, or the reverse.',
    here: 'This is where the three compression levels differ most sharply.',
  },
  {
    term: 'GGUF',
    plain: 'The file format these compressed models are packaged in. One file holds the model\'s numbers plus the information needed to run it.',
    here: 'Each of the three model files on the Mac is a GGUF file, which is why their sizes are directly comparable.',
  },
  {
    term: 'Model serving',
    plain: 'The job of keeping a model loaded and answering requests — handling who asks what, when to load and unload, and how to stream answers back.',
    here: 'Ollama does the serving here; this site talks to it rather than to the model directly.',
  },
  {
    term: 'Ollama',
    plain: 'A program that runs language models on your own machine and offers them over a simple local interface, so other software can use them without touching the internet.',
    here: 'Runs on the Mac at all times. It is the only thing that ever loads a model in this project.',
  },
]

export const methodology = [
  {
    q: 'Why throw away the first generation?',
    a: 'The very first request after a model is loaded pays the cost of reading a large file from disk into memory. Including it would measure storage speed, not inference speed. So one generation is run and discarded before measurement starts.',
  },
  {
    q: 'Why unload the model between compression levels?',
    a: 'If the previous level were still resident, the next level\'s memory reading would include it. Each level is explicitly evicted so its memory figure is its own.',
  },
  {
    q: 'Where do the token counts come from?',
    a: 'From the serving engine\'s own accounting, not estimated from character counts. Tokens per second is computed two ways — from the engine\'s internal timing and from wall-clock — and both are stored. Where they disagree, that disagreement is itself informative.',
  },
  {
    q: 'What is the memory figure?',
    a: 'What the serving engine reports the model occupying while loaded, rather than the operating system\'s view of the whole process — which would also include the server itself and be noisier.',
  },
  {
    q: 'What does this NOT tell you?',
    a: 'Nothing about output quality. Speed and size are measured; whether the 2-bit model gives worse answers is a judgement no timer can make. That is what the observations section is for. It also measures exactly one model on exactly one machine — the shape of the result should generalise, the specific numbers should not.',
  },
]

// Azlan's own read on output quality. The one thing the benchmark cannot measure.
export const observations: string | null = null
