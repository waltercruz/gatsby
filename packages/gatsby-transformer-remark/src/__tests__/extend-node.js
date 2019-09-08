const { graphql } = require(`gatsby/graphql`)
const { onCreateNode } = require(`../gatsby-node`)
const extendNodeType = require(`../extend-node-type`)
const { createContentDigest } = require(`gatsby-core-utils`)
const { typeDefs } = require(`../create-schema-customization`)

jest.mock(`gatsby-cli/lib/reporter`, () => {
  return {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    activityTimer: () => {
      return {
        start: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
      }
    },
  }
})

// given a set of nodes and a query, return the result of the query
async function queryResult(
  nodes,
  fragment,
  { additionalParameters = {}, pluginOptions = {} }
) {
  const extendNodeTypeFields = await extendNodeType(
    {
      type: { name: `MarkdownRemark` },
      cache: {
        get: () => null,
        set: () => null,
      },
      getNodesByType: type => [],
      ...additionalParameters,
    },
    {
      plugins: [],
      ...pluginOptions,
    }
  )

  const {
    createSchemaComposer,
  } = require(`../../../gatsby/src/schema/schema-composer`)

  const {
    addInferredFields,
  } = require(`../../../gatsby/src/schema/infer/add-inferred-fields`)
  const {
    getExampleValue,
  } = require(`../../../gatsby/src/schema/infer/example-value`)

  const typeName = `MarkdownRemark`
  const sc = createSchemaComposer()
  const tc = sc.createObjectTC(typeName)
  sc.addTypeDefs(typeDefs)
  addInferredFields({
    schemaComposer: sc,
    typeComposer: tc,
    exampleValue: getExampleValue({ nodes, typeName }),
  })
  tc.addFields(extendNodeTypeFields)
  sc.Query.addFields({
    listNode: { type: [tc], resolve: () => nodes },
  })
  const schema = sc.buildSchema()

  const result = await graphql(
    schema,
    `query {
        listNode {
            ${fragment}
        }
      }
    `
  )
  return result
}

const bootstrapTest = (
  label,
  content,
  query,
  test,
  { additionalParameters = {}, pluginOptions = {} } = {}
) => {
  const node = {
    id: `whatever`,
    children: [],
    internal: {
      contentDigest: `whatever`,
      mediaType: `text/markdown`,
    },
  }
  // Make some fake functions its expecting.
  const loadNodeContent = node => Promise.resolve(node.content)

  it(label, async done => {
    node.content = content
    const createNode = markdownNode => {
      queryResult([markdownNode], query, {
        additionalParameters,
        pluginOptions,
      }).then(result => {
        if (result.errors) {
          done.fail(result.errors)
        }

        try {
          test(result.data.listNode[0])
          done()
        } catch (err) {
          done.fail(err)
        }
      })
    }
    const createParentChildLink = jest.fn()
    const actions = { createNode, createParentChildLink }
    const createNodeId = jest.fn()
    createNodeId.mockReturnValue(`uuid-from-gatsby`)

    // Used to verify that console.warn is called when field not found
    jest.spyOn(global.console, `warn`)

    await onCreateNode(
      {
        node,
        loadNodeContent,
        actions,
        createNodeId,
        createContentDigest,
      },
      { ...additionalParameters, ...pluginOptions }
    )
  })
}

describe(`Excerpt is generated correctly from schema`, () => {
  bootstrapTest(
    `correctly loads an excerpt`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
Where oh where is my little pony?`,
    `excerpt
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(`Where oh where is my little pony?`)
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where oh where is my little pony?`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    }
  )

  bootstrapTest(
    `correctly loads a default excerpt`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---`,
    `excerpt
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(``)
      expect(node.excerptAst).toMatchObject({
        children: [],
        data: { quirksMode: false },
        type: `root`,
      })
    }
  )

  bootstrapTest(
    `correctly uses excerpt separator`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
Where oh where is my little pony?
<!-- end -->
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi auctor sit amet velit id facilisis. Nulla viverra, eros at efficitur pulvinar, lectus orci accumsan nisi, eu blandit elit nulla nec lectus. Integer porttitor imperdiet sapien. Quisque in orci sed nisi consequat aliquam. Aenean id mollis nisi. Sed auctor odio id erat facilisis venenatis. Quisque posuere faucibus libero vel fringilla.

In quis lectus sed eros efficitur luctus. Morbi tempor, nisl eget feugiat tincidunt, sem velit vulputate enim, nec interdum augue enim nec mauris. Nulla iaculis ante sed enim placerat pretium. Nulla metus odio, facilisis vestibulum lobortis vitae, bibendum at nunc. Donec sit amet efficitur metus, in bibendum nisi. Vivamus tempus vel turpis sit amet auctor. Maecenas luctus vestibulum velit, at sagittis leo volutpat quis. Praesent posuere nec augue eget sodales. Pellentesque vitae arcu ut est varius venenatis id maximus sem. Curabitur non consectetur turpis.
      `,
    `excerpt
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(`Where oh where is my little pony?`)
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where oh where is my little pony?`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
          {
            type: `text`,
            value: `\n`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )

  const contentWithSeparator = `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
Where oh where **is** my little pony?
<!-- end -->
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi auctor sit amet velit id facilisis. Nulla viverra, eros at efficitur pulvinar, lectus orci accumsan nisi, eu blandit elit nulla nec lectus. Integer porttitor imperdiet sapien. Quisque in orci sed nisi consequat aliquam. Aenean id mollis nisi. Sed auctor odio id erat facilisis venenatis. Quisque posuere faucibus libero vel fringilla.

In quis lectus sed eros efficitur luctus. Morbi tempor, nisl eget feugiat tincidunt, sem velit vulputate enim, nec interdum augue enim nec mauris. Nulla iaculis ante sed enim placerat pretium. Nulla metus odio, facilisis vestibulum lobortis vitae, bibendum at nunc. Donec sit amet efficitur metus, in bibendum nisi. Vivamus tempus vel turpis sit amet auctor. Maecenas luctus vestibulum velit, at sagittis leo volutpat quis. Praesent posuere nec augue eget sodales. Pellentesque vitae arcu ut est varius venenatis id maximus sem. Curabitur non consectetur turpis.
`

  bootstrapTest(
    `given PLAIN correctly uses excerpt separator`,
    contentWithSeparator,
    `excerpt(format: PLAIN)`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(`Where oh where is my little pony?`)
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )

  bootstrapTest(
    `given HTML correctly uses excerpt separator`,
    contentWithSeparator,
    `excerpt(format: HTML)`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(
        `<p>Where oh where <strong>is</strong> my little pony?</p>\n`
      )
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )

  bootstrapTest(
    `given MARKDOWN correctly uses excerpt separator`,
    contentWithSeparator,
    `excerpt(format: MARKDOWN)`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(`Where oh where **is** my little pony?\n`)
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )

  const content = `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
Where oh where is my little pony? Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi auctor sit amet velit id facilisis. Nulla viverra, eros at efficitur pulvinar, lectus orci accumsan nisi, eu blandit elit nulla nec lectus. Integer porttitor imperdiet sapien. Quisque in orci sed nisi consequat aliquam. Aenean id mollis nisi. Sed auctor odio id erat facilisis venenatis. Quisque posuere faucibus libero vel fringilla.
In quis lectus sed eros efficitur luctus. Morbi tempor, nisl eget feugiat tincidunt, sem velit vulputate enim, nec interdum augue enim nec mauris. Nulla iaculis ante sed enim placerat pretium. Nulla metus odio, facilisis vestibulum lobortis vitae, bibendum at nunc. Donec sit amet efficitur metus, in bibendum nisi. Vivamus tempus vel turpis sit amet auctor. Maecenas luctus vestibulum velit, at sagittis leo volutpat quis. Praesent posuere nec augue eget sodales. Pellentesque vitae arcu ut est varius venenatis id maximus sem. Curabitur non consectetur turpis.
  `

  bootstrapTest(
    `correctly prunes length to default value`,
    content,
    `excerpt
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt.length).toBe(139)
      expect(node.excerptAst.children.length).toBe(1)
      expect(node.excerptAst.children[0].children.length).toBe(1)
      expect(node.excerptAst.children[0].children[0].value.length).toBe(139)
    }
  )

  bootstrapTest(
    `correctly prunes length to provided parameter`,
    content,
    `excerpt(pruneLength: 50)
      excerptAst(pruneLength: 50)
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt.length).toBe(46)
      expect(node.excerptAst.children.length).toBe(1)
      expect(node.excerptAst.children[0].children.length).toBe(1)
      expect(node.excerptAst.children[0].children[0].value.length).toBe(46)
    }
  )

  bootstrapTest(
    `correctly prunes length to provided parameter with truncate`,
    content,
    `excerpt(pruneLength: 50, truncate: true)
      excerptAst(pruneLength: 50, truncate: true)
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt.length).toBe(50)
      expect(node.excerptAst.children.length).toBe(1)
      expect(node.excerptAst.children[0].children.length).toBe(1)
      expect(node.excerptAst.children[0].children[0].value.length).toBe(50)
    }
  )

  describe(`when plugins options has a excerpt_separator defined`, () => {
    bootstrapTest(
      `correctly prunes length to default value`,
      content,
      `excerpt
        excerptAst
        frontmatter {
            title
        }
        `,
      node => {
        expect(node).toMatchSnapshot()
        expect(node.excerpt.length).toBe(139)
        expect(node.excerptAst.children.length).toBe(1)
        expect(node.excerptAst.children[0].children.length).toBe(1)
        expect(node.excerptAst.children[0].children[0].value.length).toBe(139)
      },
      { pluginOptions: { excerpt_separator: `<!-- end -->` } }
    )

    bootstrapTest(
      `correctly prunes length to provided parameter`,
      content,
      `excerpt(pruneLength: 50)
        excerptAst(pruneLength: 50)
        frontmatter {
            title
        }
        `,
      node => {
        expect(node).toMatchSnapshot()
        expect(node.excerpt.length).toBe(46)
        expect(node.excerptAst.children.length).toBe(1)
        expect(node.excerptAst.children[0].children.length).toBe(1)
        expect(node.excerptAst.children[0].children[0].value.length).toBe(46)
      },
      { pluginOptions: { excerpt_separator: `<!-- end -->` } }
    )

    bootstrapTest(
      `correctly prunes length to provided parameter with truncate`,
      content,
      `excerpt(pruneLength: 50, truncate: true)
        excerptAst(pruneLength: 50, truncate: true)
        frontmatter {
            title
        }
        `,
      node => {
        expect(node).toMatchSnapshot()
        expect(node.excerpt.length).toBe(50)
        expect(node.excerptAst.children.length).toBe(1)
        expect(node.excerptAst.children[0].children.length).toBe(1)
        expect(node.excerptAst.children[0].children[0].value.length).toBe(50)
      },
      { pluginOptions: { excerpt_separator: `<!-- end -->` } }
    )
  })

  bootstrapTest(
    `given an html format, it correctly maps nested markdown to html`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

Where oh [*where*](nick.com) **_is_** ![that pony](pony.png)?`,
    `excerpt(format: HTML)
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(
        `<p>Where oh <a href="nick.com"><em>where</em></a> <strong><em>is</em></strong> <img src="pony.png" alt="that pony">?</p>`
      )
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where oh `,
              },
              {
                children: [
                  {
                    children: [
                      {
                        type: `text`,
                        value: `where`,
                      },
                    ],
                    properties: {},
                    tagName: `em`,
                    type: `element`,
                  },
                ],
                properties: {
                  href: `nick.com`,
                },
                tagName: `a`,
                type: `element`,
              },
              {
                type: `text`,
                value: ` `,
              },
              {
                children: [
                  {
                    children: [
                      {
                        type: `text`,
                        value: `is`,
                      },
                    ],
                    properties: {},
                    tagName: `em`,
                    type: `element`,
                  },
                ],
                properties: {},
                tagName: `strong`,
                type: `element`,
              },
              {
                type: `text`,
                value: ` `,
              },
              {
                children: [],
                properties: {
                  alt: `that pony`,
                  src: `pony.png`,
                },
                tagName: `img`,
                type: `element`,
              },
              {
                type: `text`,
                value: `?`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    }
  )

  bootstrapTest(
    `excerpt does have missing words and extra spaces`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

Where oh [*where*](nick.com) **_is_** ![that pony](pony.png)?`,
    `excerpt
      frontmatter {
          title
      }
      `,
    node => {
      expect(node.excerpt).toBe(`Where oh where is that pony?`)
    },
    {}
  )

  bootstrapTest(
    `excerpt does not have leading or trailing spaces`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

 My pony likes space on the left and right! `,
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(`My pony likes space on the left and right!`)
    },
    {}
  )

  bootstrapTest(
    `excerpt has spaces between paragraphs`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

My pony is little.

Little is my pony.`,
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(`My pony is little. Little is my pony.`)
    },
    {}
  )

  bootstrapTest(
    `excerpt has spaces between headings`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

# Ponies: The Definitive Guide

# What time is it?

It's pony time.`,
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(
        `Ponies: The Definitive Guide What time is it? It's pony time.`
      )
    },
    {}
  )

  bootstrapTest(
    `excerpt has spaces between table cells`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

| Pony           | Owner    |
| -------------- | -------- |
| My Little Pony | Me, Duh  |`,
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(`Pony Owner My Little Pony Me, Duh`)
    },
    {}
  )

  bootstrapTest(
    `excerpt converts linebreaks into spaces`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

If my pony ain't broke,${`  `}
don't fix it.`,
    // ^ Explicit syntax for trailing spaces to not get accidentally trimmed.
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(`If my pony ain't broke, don't fix it.`)
    },
    {}
  )

  bootstrapTest(
    `excerpt does not have more than one space between elements`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

# Pony express

[some-link]: https://pony.my

Pony express had nothing on my little pony.`,
    `excerpt`,
    node => {
      expect(node.excerpt).toBe(
        `Pony express Pony express had nothing on my little pony.`
      )
    },
    {}
  )

  bootstrapTest(
    `given raw html in the text body, this html is not escaped`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

Where is my <code>pony</code> named leo?`,
    `excerpt(format: HTML)
      excerptAst
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(
        `<p>Where is my <code>pony</code> named leo?</p>`
      )
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where is my `,
              },
              {
                children: [
                  {
                    type: `text`,
                    value: `pony`,
                  },
                ],
                properties: {},
                tagName: `code`,
                type: `element`,
              },
              {
                type: `text`,
                value: ` named leo?`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )

  bootstrapTest(
    `given an html format, it prunes large excerpts`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

Where oh where is that pony? Is he in the stable or down by the stream?`,
    `excerpt(format: HTML, pruneLength: 50)
      excerptAst(pruneLength: 50)
      frontmatter {
          title
      }
      `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(
        `<p>Where oh where is that pony? Is he in the stable…</p>`
      )
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where oh where is that pony? Is he in the stable…`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    }
  )

  bootstrapTest(
    `given an html format, it respects the excerpt_separator`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---

Where oh where is that *pony*? Is he in the stable or by the stream?

<!-- end -->
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi auctor sit amet velit id facilisis. Nulla viverra, eros at efficitur pulvinar, lectus orci accumsan nisi, eu blandit elit nulla nec lectus. Integer porttitor imperdiet sapien. Quisque in orci sed nisi consequat aliquam. Aenean id mollis nisi. Sed auctor odio id erat facilisis venenatis. Quisque posuere faucibus libero vel fringilla.
`,
    `excerpt(format: HTML, pruneLength: 50)
    excerptAst(pruneLength: 50)
    frontmatter {
        title
    }
    `,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.excerpt).toBe(
        `<p>Where oh where is that <em>pony</em>? Is he in the stable or by the stream?</p>\n`
      )
      expect(node.excerptAst).toMatchObject({
        children: [
          {
            children: [
              {
                type: `text`,
                value: `Where oh where is that `,
              },
              {
                children: [
                  {
                    type: `text`,
                    value: `pony`,
                  },
                ],
                properties: {},
                tagName: `em`,
                type: `element`,
              },
              {
                type: `text`,
                value: `? Is he in the stable or by the stream?`,
              },
            ],
            properties: {},
            tagName: `p`,
            type: `element`,
          },
          {
            type: `text`,
            value: `\n`,
          },
        ],
        data: { quirksMode: false },
        type: `root`,
      })
    },
    { pluginOptions: { excerpt_separator: `<!-- end -->` } }
  )
})

describe(`Wordcount and timeToRead are generated correctly from schema`, () => {
  bootstrapTest(
    `correctly uses wordCount parameters`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
Where oh where is my little pony? Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi auctor sit amet velit id facilisis. Nulla viverra, eros at efficitur pulvinar, lectus orci accumsan nisi, eu blandit elit nulla nec lectus. Integer porttitor imperdiet sapien. Quisque in orci sed nisi consequat aliquam. Aenean id mollis nisi. Sed auctor odio id erat facilisis venenatis. Quisque posuere faucibus libero vel fringilla.

In quis lectus sed eros efficitur luctus. Morbi tempor, nisl eget feugiat tincidunt, sem velit vulputate enim, nec interdum augue enim nec mauris. Nulla iaculis ante sed enim placerat pretium. Nulla metus odio, facilisis vestibulum lobortis vitae, bibendum at nunc. Donec sit amet efficitur metus, in bibendum nisi. Vivamus tempus vel turpis sit amet auctor. Maecenas luctus vestibulum velit, at sagittis leo volutpat quis. Praesent posuere nec augue eget sodales. Pellentesque vitae arcu ut est varius venenatis id maximus sem. Curabitur non consectetur turpis.
`,
    `wordCount {
      words
      paragraphs
      sentences
    }
    frontmatter {
        title
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.wordCount).toEqual({
        paragraphs: 2,
        sentences: 19,
        words: 150,
      })
    }
  )

  const content = `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
`

  bootstrapTest(
    `correctly uses a default value for wordCount`,
    content,
    `wordCount {
      words
      paragraphs
      sentences
    }
    frontmatter {
        title
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.wordCount).toEqual({
        paragraphs: null,
        sentences: null,
        words: null,
      })
    }
  )

  bootstrapTest(
    `correctly uses a default value for timeToRead`,
    content,
    `timeToRead
    frontmatter {
        title
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.timeToRead).toBe(1)
    }
  )
})

describe(`Table of contents is generated correctly from schema`, () => {
  bootstrapTest(
    `returns null on non existing table of contents field`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
# first title

some text

## second title

some other text
`,
    `tableOfContents
    frontmatter {
        title
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(console.warn).toBeCalled()
    }
  )

  bootstrapTest(
    `correctly generates table of contents`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
# first title

some text

## second title

some other text

# third title

final text
`,
    `tableOfContents(pathToSlugField: "frontmatter.title")
    frontmatter {
        title
    }`,
    node => {
      expect(node).toMatchSnapshot()
    }
  )

  bootstrapTest(
    `table of contents is generated with correct depth (graphql option)`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
# first title

some text

## second title

some other text`,
    `tableOfContents(pathToSlugField: "frontmatter.title", maxDepth: 1)
    frontmatter {
        title
    }`,
    node => {
      expect(node.tableOfContents).toBe(`<ul>
<li><a href="/my%20little%20pony/#first-title">first title</a></li>
</ul>`)
    }
  )

  bootstrapTest(
    `table of contents is generated with correct depth (plugin option)`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
# first title

some text

## second title

some other text`,
    `tableOfContents(pathToSlugField: "frontmatter.title")
    frontmatter {
        title
    }`,
    node => {
      expect(node.tableOfContents).toBe(`<ul>
<li><a href="/my%20little%20pony/#first-title">first title</a></li>
</ul>`)
    },
    {
      pluginOptions: {
        tableOfContents: {
          maxDepth: 1,
        },
      },
    }
  )

  bootstrapTest(
    `table of contents is generated from given heading onwards`,
    `---
title: "my little pony"
date: "2017-09-18T23:19:51.246Z"
---
# first title

some text

## second title

some other text

# third title

final text`,
    `tableOfContents(pathToSlugField: "frontmatter.title", heading: "first title")
    frontmatter {
        title
    }`,
    node => {
      expect(node.tableOfContents).toBe(`<ul>
<li><a href="/my%20little%20pony/#third-title">third title</a></li>
</ul>`)
    }
  )
})

describe(`Relative links keep being relative`, () => {
  const assetPrefix = ``
  const basePath = `/prefix`
  const pathPrefix = assetPrefix + basePath

  bootstrapTest(
    `relative links are not prefixed`,
    `
This is [a link](path/to/page1).

This is [a reference]

[a reference]: ./path/to/page2
`,
    `html`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.html).toMatch(`<a href="path/to/page1">`)
      expect(node.html).toMatch(`<a href="./path/to/page2">`)
    },
    { additionalParameters: { pathPrefix: pathPrefix, basePath: basePath } }
  )
})

describe(`Links are correctly prefixed`, () => {
  const assetPrefix = ``
  const basePath = `/prefix`
  const pathPrefix = assetPrefix + basePath

  bootstrapTest(
    `correctly prefixes links`,
    `
This is [a link](/path/to/page1).

This is [a reference]

[a reference]: /path/to/page2
`,
    `html`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.html).toMatch(`<a href="/prefix/path/to/page1">`)
      expect(node.html).toMatch(`<a href="/prefix/path/to/page2">`)
    },
    { additionalParameters: { pathPrefix: pathPrefix, basePath: basePath } }
  )
})

describe(`Links are correctly prefixed when assetPrefix is used`, () => {
  const assetPrefix = `https://example.com/assets`
  const basePath = `/prefix`
  const pathPrefix = assetPrefix + basePath

  bootstrapTest(
    `correctly prefixes links`,
    `
This is [a link](/path/to/page1).

This is [a reference]

[a reference]: /path/to/page2
`,
    `html`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.html).toMatch(`<a href="/prefix/path/to/page1">`)
      expect(node.html).toMatch(`<a href="/prefix/path/to/page2">`)
    },
    { additionalParameters: { pathPrefix: pathPrefix, basePath: basePath } }
  )
})

describe(`Code block metas are correctly generated`, () => {
  bootstrapTest(
    `code block with language and meta`,
    `
\`\`\`js foo bar
console.log('hello world')
\`\`\`
`,
    `htmlAst`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.htmlAst.children[0].children[0].properties.className).toEqual(
        [`language-js`]
      )
      expect(node.htmlAst.children[0].children[0].properties.dataMeta).toEqual(
        `foo bar`
      )
    }
  )
})

describe(`Headings are generated correctly from schema`, () => {
  bootstrapTest(
    `returns value`,
    `
# first title

## second title
`,
    `headings {
      value
      depth
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.headings).toEqual([
        {
          value: `first title`,
          depth: 1,
        },
        {
          value: `second title`,
          depth: 2,
        },
      ])
    }
  )

  bootstrapTest(
    `returns value with inlineCode`,
    `
# first title

## \`second title\`
`,
    `headings {
      value
      depth
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.headings).toEqual([
        {
          value: `first title`,
          depth: 1,
        },
        {
          value: `second title`,
          depth: 2,
        },
      ])
    }
  )

  bootstrapTest(
    `returns value with mixed text`,
    `
# An **important** heading with \`inline code\` and text
`,
    `headings {
      value
      depth
    }`,
    node => {
      expect(node).toMatchSnapshot()
      expect(node.headings).toEqual([
        {
          value: `An important heading with inline code and text`,
          depth: 1,
        },
      ])
    }
  )
})
