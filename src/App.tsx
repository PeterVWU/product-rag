import { useState } from 'react'
import './App.css'

type SearchResult = {
  id: string
  score: number
  metadata: {
    name: string
    shortDescription: string
    sku: string
  }
}


function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/search-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
      const data = await response.json()
      setResults(data || [])
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="search-box">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="results">
        {results.map((result) => (
          <div key={result.id} className="result-card">
            <h3>{result.metadata.name}</h3>
            <p>{result.metadata.shortDescription}</p>
            <div className="result-footer">
              <span>SKU: {result.metadata.sku}</span>
              <br />
              <span>Short description: {result.metadata.shortDescription}</span>
              <br />
              <span>Score: {(result.score * 100).toFixed(2)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
