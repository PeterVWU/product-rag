interface Env {
    AI: Ai
    VECTORIZE: Vectorize
    ASSETS: {
        fetch: typeof fetch
    }
}

type ProductType = {
    name: string
    sku: string
    shortDescription: string
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url)

        if (url.pathname.startsWith('/api/create-vector-database')) {
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                })
            }
            if (request.method !== 'POST') {
                return new Response(`${request.method} Method not allowed`, {
                    status: 405,
                })
            }
            try {
                await createVectorDatabase(request, env)
            } catch (error) {
                return new Response(
                    JSON.stringify({ error: 'Internal Server Error' }),
                    {
                        status: 500,
                    }
                )
            }
            return new Response('Creating vector database', {
                status: 200,
            })
        }
        if (url.pathname.startsWith('/api/search-product')) {
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                })
            }
            try {
                const result = await searchProduct(request, env)
                return new Response(JSON.stringify(result), {
                    headers: { 'Content-Type': 'application/json' },
                })
            } catch (error) {
                return new Response(
                    JSON.stringify({ error: 'Internal Server Error' }),
                    {
                        status: 500,
                    }
                )
            }
        }

        return env.ASSETS.fetch(request)
    },
} satisfies ExportedHandler<Env>

async function createVectorDatabase(request: Request, env: Env) {
    console.log('Creating vector database')
    const { googleDriveUrl }: any = await request.json()
    console.log('googleDriveUrl')
    try {
        const products = await getProducts(googleDriveUrl)
        await embedProducts(products, env)
    } catch (error) {
        console.error('Error embedding products:', error)
        throw new Error('Failed to embed products')
    }
}

async function getProducts(googleDriveUrl: string): Promise<ProductType[]> {
    const csvResponse = await fetch(googleDriveUrl)
    const csvText = await csvResponse.text()
    const uniqueProducts = new Map<string, ProductType>()
    console.log('csvResponse')
    csvText
        .split('\n')
        .slice(1) // Skip header row
        .filter((line) => {
            const [sku] = line
            return line.trim() !== '' && sku !== ''
        })
        .map((line) => {
            const [name, shortDescription, sku] = line
                .split(',')
                .map((field) => field.trim())
            return {
                name: stripHtmlTags(name),
                shortDescription: stripHtmlTags(shortDescription),
                sku,
            }
        })
        .forEach((product) => {
            // Only keep the first occurrence of each SKU
            if (!uniqueProducts.has(product.sku)) {
                uniqueProducts.set(product.sku, product)
            }
        })

    return Array.from(uniqueProducts.values())
}

function stripHtmlTags(str: string): string {
    return str
        ? str
              .replace(/<[^>]*>/g, '')
              .replace(/&[^;]+;/g, ' ')
              .replace(/^["']|["']$/g, '')
              .trim()
        : ''
}

async function embedProducts(products: ProductType[], env: Env) {
    const batchSize = 20
    for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        await processProductBatch(batch, env)
    }
    console.log(`Successfully embedded ${products.length} products`)
}

async function processProductBatch(products: ProductType[], env: Env) {
    console.log('Processing product batch', products)
    const embeddings: number[][] = []

    // Process embeddings sequentially
    for (const product of products) {
        const embedding = await generateEmbedding(product, env)
        embeddings.push(embedding)
    }

    const vectors: VectorizeVector[] = products.map((product, index) => ({
        id: product.sku.slice(0, 16),
        values: embeddings[index],
        metadata: {
            name: product.name,
            shortDescription: product.shortDescription,
            sku: product.sku,
        },
    }))

    await env.VECTORIZE.upsert(vectors)
}

async function generateEmbedding(
    product: ProductType,
    env: Env
): Promise<number[]> {
    const text = `Name: ${product.name}\nShort Description: ${product.shortDescription}\nSKU: ${product.sku}`
    console.log('Generating embedding for:', text)
    try {
        const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: text,
        })

        return response.data[0]
    } catch (error) {
        console.error('Error generating embedding:', error)
        throw new Error('Failed to generate embedding')
    }
}

async function searchProduct(request: Request, env: Env): Promise<object> {
    try {
        const { query }: any = await request.json()
        const embedding = await generateQueryEmbedding(query, env)

        const searchResults = await env.VECTORIZE.query(embedding, {
            topK: 10,
            returnValues: true,
            returnMetadata: 'all',
        })
        searchResults.matches.forEach((match) => {
            console.log('match', match)
        })
        if (!searchResults.matches.length) {
            return { result: '' }
        }

        const bestMatch = searchResults.matches[0]
        return searchResults.matches.map((match) => {
            return { score: match.score, metadata: match.metadata }
        })
        const metadata = bestMatch.metadata as {
            question: string
            answer: string
        }
        console.log('bestmatch', bestMatch.score)
        console.log('metadata.answer', metadata)

        return bestMatch.score > 0.7 ? { result: metadata } : { result: '' }
    } catch (error) {
        console.error('Error searching FAQs:', error)
        return { result: '' }
    }
}

async function generateQueryEmbedding(
    query: string,
    env: Env
): Promise<number[]> {
    try {
        const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
            text: query,
        })

        return response.data[0]
    } catch (error) {
        console.error('Error generating query embedding:', error)
        throw new Error('Failed to generate embedding')
    }
}
