import PrintStyle from 'printstyle'

const ps = new PrintStyle()

const TAG_COLORS = {
  image: 'greenBright',
  info: 'blue',
  error: 'redBright'
}

const DEFAULT_COLOR = 'white'

let quiet = false

export function setQuiet(value) {
  quiet = value
}

export default function log({ tag, error, text, link, size, time }) {
  if (quiet && tag !== 'error') return

  const isError = error || tag === 'error'
  const color = TAG_COLORS[tag] || DEFAULT_COLOR
  let msg = ps.paint(`{${color}.bold|[${tag}]}`)

  if (isError) {
    msg += ps.paint(' {redBright.bold|[error]}')
  }

  msg += ps.paint(` {dim|${text}}`)

  if (link) {
    msg += ps.paint(` {italic.underline|${link}}`)
  }

  if (size) {
    msg += ps.paint(` {greenBright|${size}}`)
  }

  if (time) {
    msg += ps.paint(` {green|(${time})}`)
  }

  if (isError) {
    console.error(msg + ps.bell)
  } else {
    console.log(msg)
  }
}
