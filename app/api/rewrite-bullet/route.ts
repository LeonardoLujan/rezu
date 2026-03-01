import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { bulletText, action } = await req.json()

  if (!bulletText || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const prompt = action === 'expand'
    ? `You are a professional resume writer. The following resume bullet point leaves unused horizontal space on the line. Rewrite it to be more detailed and impactful by adding specific metrics, tools used, or quantified outcomes. Keep it to one concise line. Return ONLY the rewritten bullet point, preserving any leading bullet character (•, -, etc). No explanation.\n\nOriginal: ${bulletText}`
    : `You are a professional resume writer. The following resume bullet point is very short. Rewrite it to be more concise and impactful by removing filler words while keeping the core achievement clear and specific. Keep it to one concise line. Return ONLY the rewritten bullet point, preserving any leading bullet character (•, -, etc). No explanation.\n\nOriginal: ${bulletText}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    const rewritten = data.choices?.[0]?.message?.content?.trim()

    if (!rewritten) {
      return NextResponse.json({ error: 'No response from OpenAI' }, { status: 500 })
    }

    return NextResponse.json({ rewritten })
  } catch (e) {
    console.error('OpenAI API error:', e)
    return NextResponse.json({ error: 'Failed to call OpenAI API' }, { status: 500 })
  }
}
