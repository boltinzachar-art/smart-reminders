import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Мы принимаем дополнительное поле customInstruction
    const { taskTitle, taskDescription, type, customInstruction } = await req.json()
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    
    // Базовая инструкция
    let prompt = `Задача: "${taskTitle}".\nДетали: "${taskDescription || ''}".\n`
    
    if (customInstruction) {
        prompt += `Дополнительное уточнение от пользователя: "${customInstruction}".\n`
    }

    // Жесткая инструкция по стилю (System Prompt внутри User Prompt для Gemini)
    const styleGuide = `
    ВАЖНО: Твоя задача — написать готовый текст сообщения (для WhatsApp или Email).
    Стиль: 
    1. Максимально естественный, обычный, человеческий.
    2. НЕ вычурный, без канцеляризмов, без лишнего официоза.
    3. Если это бытовая задача (жильцы, семья) — пиши просто и вежливо.
    4. Если это бизнес (директор, партнеры) — пиши корректно, но без воды.
    5. Пиши ТОЛЬКО текст сообщения. Никаких "Вот ваш вариант:" или кавычек.
    `

    if (type === 'web_search') {
        prompt += "Напиши 3 конкретных поисковых запроса для Google, чтобы решить эту задачу."
    } else {
        prompt += styleGuide
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )

    const data = await response.json()
    
    if (data.error) {
        console.error("Gemini API Error:", data.error)
        throw new Error(data.error.message)
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Не удалось получить ответ."

    return new Response(JSON.stringify({ result: text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})