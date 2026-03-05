import { useState, useMemo } from 'react';

const EMOJI_DATA = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏'],
  'People': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','🗨️','🗯️','💭','💤'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋'],
  'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫛','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠'],
  'Activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🥅','⛳','🪃','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿'],
  'Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚔','🚍','🚘','🚖','🛩️','✈️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️'],
  'Objects': ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️'],
  'Symbols': ['✅','❌','❓','❗','‼️','⁉️','💲','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','💠','🔶','🔷','🔸','🔹','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','🔲'],
  'Flags': ['🏳️','🏴','🏁','🚩','🎌','🏴‍☠️','🇺🇸','🇬🇧','🇨🇦','🇦🇺','🇩🇪','🇫🇷','🇯🇵','🇰🇷','🇧🇷','🇮🇳','🇲🇽','🇪🇸','🇮🇹','🇷🇺','🇨🇳','🇸🇦','🇦🇪','🇿🇦','🇳🇬','🇪🇬','🇰🇪','🇹🇷','🇸🇪','🇳🇴','🇩🇰','🇫🇮'],
};

export default function EmojiPicker({ onSelect }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Smileys');

  const categories = Object.keys(EMOJI_DATA);

  const filteredEmojis = useMemo(() => {
    if (!search) return null;
    const all = Object.values(EMOJI_DATA).flat();
    return all.filter(e => e.includes(search));
  }, [search]);

  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-search">
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!search && (
        <div className="emoji-categories">
          {categories.map(cat => (
            <button
              key={cat}
              className={`emoji-category-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              title={cat}
            >
              {EMOJI_DATA[cat][0]}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-grid">
        {search ? (
          filteredEmojis?.length > 0 ? (
            filteredEmojis.map((emoji, i) => (
              <button key={i} className="emoji-btn" onClick={() => onSelect(emoji)}>
                {emoji}
              </button>
            ))
          ) : (
            <div className="emoji-empty">No emoji found</div>
          )
        ) : (
          <>
            <div className="emoji-category-label">{activeCategory}</div>
            {EMOJI_DATA[activeCategory]?.map((emoji, i) => (
              <button key={i} className="emoji-btn" onClick={() => onSelect(emoji)}>
                {emoji}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
