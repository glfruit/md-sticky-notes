import { useState } from 'react'

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: '笑脸',
    emojis: ['😀','😄','😁','😂','🤣','😊','😍','🥰','😘','😜','🤪','😎','🤔','😴','😭','😅','😉','🙃','😇','🥳','😤','😱','🤯','😬'],
  },
  {
    name: '手势',
    emojis: ['👍','👎','👏','🙌','🙏','💪','🤝','✌️','🤞','👌','🫶','✍️','👋','🤙','☝️','👆','👇','👉','👈'],
  },
  {
    name: '常用',
    emojis: ['❤️','🔥','✨','⭐','💡','🎯','🚀','🎉','🎊','💯','✅','❌','⚠️','❓','❗','💬','📌','📍','🔔','⏰','📅','🕐','🔗','📎'],
  },
  {
    name: '动物',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦄','🐝','🦋','🌸','🌺','🌻','🍀'],
  },
  {
    name: '食物',
    emojis: ['🍎','🍊','🍋','🍉','🍇','🍓','🫐','🍑','🥭','🍍','🥝','🍅','🥑','🌶️','🍚','🍜','🍣','🍕','🍔','🌮','🍦','🍰','☕','🧋'],
  },
  {
    name: '物品',
    emojis: ['⚽','🏀','🏓','🎮','🎲','🎸','🎹','🎤','🎧','📱','💻','⌚️','📷','🎁','📚','✏️','📝','🔑','💰','🛒','✈️','🚗','🚲','🏠'],
  },
]

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [tab, setTab] = useState(0)
  const cat = EMOJI_CATEGORIES[tab]

  return (
    <div className="rounded-lg bg-white/95 backdrop-blur shadow-xl border border-black/15 overflow-hidden">
      <div className="flex border-b border-black/10">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.name}
            className={`flex-1 py-1 text-[10px] transition-colors ${
              i === tab ? 'bg-black/10 font-medium text-black/75' : 'text-black/45 hover:bg-black/5'
            }`}
            onClick={() => setTab(i)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-1.5 h-[132px] overflow-y-auto">
        {cat.emojis.map((e) => (
          <button
            key={e}
            className="text-[17px] leading-none p-1 rounded hover:bg-black/10 hover:scale-110 transition-transform"
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
