/* eslint-disable jsx-a11y/accessible-emoji */
import './App.css'
import data from './data.js'
import React from 'react'
import { Provider, connect } from 'react-redux'
import { createStore } from 'redux'
import * as emojiStrip from 'emoji-strip'

/**************************************************************
 * Constants
 **************************************************************/

const KEY_ENTER = 13
const KEY_ESCAPE = 27

// maximum number of grandchildren that are allowed to expand
const EXPAND_MAX = 20

/**************************************************************
 * Helpers
 **************************************************************/

// parses the items from the url
const getItemsFromUrl = () => {
  const urlComponents = window.location.pathname.slice(1)
  return urlComponents
    ? urlComponents.split('/').map(component => window.decodeURIComponent(component))
    : ['root']
}

const getFromFromUrl = () => {
  return window.location.search
    ? window.decodeURIComponent(window.location.search.slice(1).split('=')[1]).split('/')
    : null
}

const deepEqual = (a, b) =>
  a.every(itemA => b.includes(itemA)) &&
  b.every(itemB => a.includes(itemB))

const deepIndexOf = (item, list) => {
  for(let i=0; i<list.length; i++) {
    if (deepEqual(item, list[i])) return i
  }
  return -1
}

const flatMap = (list, f) => Array.prototype.concat.apply([], list.map(f))

// sorts the given item to the front of the list
const sortToFront = (item, list) => {
  const i = deepIndexOf(item, list)
  if (i === -1) throw new Error(`${item} not found in ${list.join(', ')}`)
  return [].concat(
    [item],
    list.slice(0, i),
    list.slice(i + 1)
  )
}

// sorts items emoji and whitespace insensitive
const sorter = (a, b) =>
  emojiStrip(a.toString()).trim().toLowerCase() >
  emojiStrip(b.toString()).trim().toLowerCase() ? 1 : -1

// gets the signifying label of the given context.
const signifier = items => items[items.length - 1]

// returns true if the signifier of the given context exists in the data
const exists = items => !!data[signifier(items)]

// gets the intersections of the given context; i.e. the context without the signifier
const intersections = items => items.slice(0, items.length - 1)

const hasIntersections = items => items.length > 1

const getParents = (items) => {
  const key = signifier(items)
  if (!exists(items)) {
    throw new Error(`Unknown key: "${key}", from context: ${items.join(',')}`)
  }
  return data[key].memberOf
}

const subset = (items, item) => items.slice(0, items.indexOf(item) + 1)

const isRoot = items => items[0] === 'root'

// generates children of items
// TODO: cache for performance, especially of the app stays read-only
const getChildren = items => Object.keys(data).filter(key =>
  data[key].memberOf.some(parent => deepEqual(items, parent))
)

const hasChildren = items => Object.keys(data).some(key =>
  data[key].memberOf.some(parent => deepEqual(items, parent))
)

// derived children are all grandchildren of the parents of the given context
const getDerivedChildren = items =>
  getParents(items)
    .filter(parent => !isRoot(parent))
    .map(parent => parent.concat(signifier(items)))

const hasDerivedChildren = items => getParents(items).length > 1

const emptySubheadings = (focus, subheadings) =>
  hasIntersections(focus) &&
  subheadings.length === 1 &&
  !hasChildren(subheadings[0])

const isLeaf = items =>
  !hasChildren(items) &&
  !hasDerivedChildren(items) &&
  !hasChildren([signifier(items)]) // empty subheadings redirect

/**************************************************************
 * Store & Reducer
 **************************************************************/

const initialState = {
  focus: getItemsFromUrl(),
  from: getFromFromUrl(),
  editingNewItem: false,
  editingContent: '',

  // cheap trick to re-render when data has been updated
  dataNonce: 0
}

const appReducer = (state = initialState, action) => {
  return Object.assign({}, state, (({
    navigate: () => {
      if (deepEqual(state.focus, action.to) && deepEqual([].concat(getFromFromUrl()), [].concat(action.from))) return state
      if (action.history !== false) {
        window.history[action.replace ? 'replaceState' : 'pushState'](
          state.focus,
          '',
          '/' + (deepEqual(action.to, ['root']) ? '' : action.to.map(item => window.encodeURIComponent(item)).join('/')) + (action.from && action.from.length > 0 ? '?from=' + encodeURIComponent(action.from.join('/')) : '')
        )
      }
      return {
        focus: action.to,
        from: action.from,
        editingNewItem: false,
        editingContent: ''
      }
    },
    newItemSubmit: () => {

      // create item if non-existent
      if (!exists([action.value])) {
        data[action.value] = {
          id: action.value,
          value: action.value,
          memberOf: []
        }
      }

      // add to context
      data[action.value].memberOf.push(action.context)

      setTimeout(() => {
        window.document.getElementsByClassName('add-new-item')[0].textContent = ''

        // TODO
        store.dispatch({ type: 'newItemInput', value: '' })
      })

      return {
        editingContent: '',
        dataNonce: state.dataNonce + 1
      }
    },
    newItemEdit: () => {
      // wait for re-render
      setTimeout(() => {
        window.document.getElementsByClassName('add-new-item')[0].focus()
      })
      return {
        editingNewItem: true
      }
    },
    newItemCancel: () => ({
      editingNewItem: false,
      editingContent: ''
    }),
    newItemInput: () => ({
      editingContent: action.value
    })
  })[action.type] || (() => state))())
}

const store = createStore(appReducer)

/**************************************************************
 * Window Events
 **************************************************************/

window.addEventListener('popstate', () => {
  store.dispatch({
    type: 'navigate',
    to: getItemsFromUrl(),
    from: getFromFromUrl(),
    history: false
  })
})

/**************************************************************
 * Components
 **************************************************************/

const AppComponent = connect(({ dataNonce, focus, from, editingNewItem, editingContent }) => ({ dataNonce, focus, from, editingNewItem, editingContent }))(({ dataNonce, focus, from, editingNewItem, editingContent, dispatch }) => {

  const directChildren = getChildren(focus)
  const hasDirectChildren = directChildren.length > 0

  const subheadings = hasDirectChildren ? [focus]
    : from ? sortToFront(from.concat(focus), getDerivedChildren(focus).sort(sorter))
    : getDerivedChildren(focus).sort(sorter)

  // if there are derived children but they are all empty, then bail and redirect to the global context
  if (emptySubheadings(focus, subheadings)) {
    setTimeout(() => {
      dispatch({ type: 'navigate', to: [signifier(focus)], replace: true })
    }, 0)
    return null
  }

  const otherContexts = getParents(focus)

  return <div className={'content' + (from ? ' from' : '')}>
    <HomeLink />

    { /* Subheadings */ }
    <div>
      {subheadings.map((items, i) => {
        const children = (hasDirectChildren
          ? directChildren
          : getChildren(items)
        ).sort(sorter)

        // get a flat list of all grandchildren to determine if there is enough space to expand
        const grandchildren = flatMap(children, child => getChildren(items.concat(child)))

        return i === 0 || otherContexts.length > 0 || hasDirectChildren || from ? <div key={i}>
          { /* Subheading */ }
          {!isRoot(focus) ? <Subheading items={items} /> : null}

          { /* Subheading Children */ }
          {children.length > 0 ? <ul className='children'>
            {children.map((child, j) => {
              const childItems = (isRoot(focus) ? [] : items).concat(child)
              // expand the child (i.e. render grandchildren) either when looking at a specific context or the first subheading of a global context with 'from'
              return <Child key={j} items={childItems} expanded={((from && i === 0) || hasDirectChildren) && grandchildren.length > 0 && grandchildren.length < EXPAND_MAX} />
            })}
          </ul> : null}

          { /* New Item */ }
          <NewItem context={focus} editing={editingNewItem} editingContent={editingContent} />

          { /* Other Contexts */ }
          {i === 0 && otherContexts.length > 1 && (hasDirectChildren || from) ? <div className='other-contexts'>
              <Link items={hasDirectChildren || !from /* TODO: Is this right? */? [signifier(focus)] : from.concat(focus)}
                label={<span>{otherContexts.length - 1} other context{otherContexts.length > 2 ? 's' : ''} <span className={hasDirectChildren ? 'down-chevron' : 'up-chevron'}>{hasDirectChildren ? '⌄' : '⌃'}</span></span>}
                from={focus.length > 0 ? intersections(focus) : null}
            />
            </div> : null}
        </div> : null
      })}
    </div>
  </div>
})

const HomeLink = connect()(({ dispatch }) =>
  <a className='home' onClick={() => dispatch({ type: 'navigate', to: ['root'] })}><span role='img' arial-label='home'>🏠</span></a>
)

const Subheading = ({ items }) => <h2>
  {items.map((item, i) => {
    const subitems = subset(items, item)
    return <span key={i} className={item === signifier(items) ? 'subheading-focus' : null}>
      {i > 0 ? <span> + </span> : null}
      <Link items={subitems} />
      <Superscript items={subitems} />
    </span>
  })}
</h2>

const Child = ({ items, expanded }) => {
  const grandchildren = expanded ? getChildren(items) : []
  return <div className={'child' + (grandchildren.length > 0 ? ' expanded ' : '') + (isLeaf(items) ? ' leaf' : '')}>
    <li>
      <h3>
        <Link items={items} />
        <Superscript items={items} />
      </h3>

      { /* Subheading Grandchildren */ }
      {grandchildren.length > 0 ? <ul className='grandchildren'>
        {grandchildren.map((child, i) => {
          const childItems = (isRoot(items) ? [] : items).concat(child)
          return <Grandchild key={i} items={childItems} />
        })}
      </ul> : null}
    </li>
  </div>
}

const Grandchild = ({ items, leaf }) => <li className={isLeaf(items) ? 'leaf' : null}>
  <h4>
    <Link items={items} />
    <Superscript items={items} />
  </h4>
</li>


// renders a link with the appropriate label to the given context
const Link = connect()(({ items, label, from, dispatch }) => {
  const value = label || signifier(items)
  return <a className='link' onClick={e => {
    document.getSelection().removeAllRanges()
    dispatch({ type: 'navigate', to: e.shiftKey ? [signifier(items)] : items, from })}
  }>{value}</a>
})

// renders superscript if there are other contexts
const Superscript = ({ items, showSingle }) => {
  if (!items || items.length === 0 || !exists(items)) return null
  const otherContexts = getParents(items)
  return otherContexts.length > (showSingle ? 0 : 1)
    ? <sup className='num-contexts'>{otherContexts.length}</sup>
    : null
}

const NewItem = connect()(({ context, editing, editingContent, dispatch }) => {
  return <div>
    {editing ?
      <h3>
        <span contentEditable className='add-new-item' onInput={e => {
          dispatch({ type: 'newItemInput', value: e.target.textContent })
        }} onKeyDown={e => {
          if (e.keyCode === KEY_ENTER) {
            dispatch({ type: 'newItemSubmit', context, value: e.target.textContent })
          }
          else if (e.keyCode === KEY_ESCAPE) {
            dispatch({ type: 'newItemCancel' })
          }
        }}/>
        {<Superscript items={[editingContent]} showSingle={true} />}
      </h3> :
      <span className='add-icon' onClick={() => dispatch({ type: 'newItemEdit' })}>+</span>
    }
  </div>
})

const App = () => <Provider store={store}>
  <AppComponent/>
</Provider>

export default App
