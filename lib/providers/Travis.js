const request = require('request-promise-native')

class Travis {
  constructor (context) {
    this.context = context
  }

  static get ctx () {
    return 'continuous-integration/travis-ci/pr'
  }

  buildUri (build) { return `https://api.travis-ci.org/builds/${build}` }
  logUri (job) { return `https://api.travis-ci.org/jobs/${job}/log` }

  parseLog (log) {
    // sp00ky RegExp to start the extraction
    const start = new RegExp(/\$ npm test[\s\S]+?(?=>)/g)
    const end = 'Test failed.  See above for more details.'

    // Get the content between the test and end strings
    let content = log.substring(log.search(start), log.indexOf(end))

    // Remove the start string
    content = content.replace(start, '')

    // Remove the last line, it's usually extra
    content = content.substring(0, content.lastIndexOf('\n'))

    return content
  }

  async serialize () {
    const { target_url: targetUrl } = this.context.payload
    const map = new Map()
    const build = /\/builds\/(\d+)/g.exec(targetUrl)[1]
    const buildJson = JSON.parse(await request({
      uri: this.buildUri(build),
      headers: { Accept: 'application/vnd.travis-ci.2+json' }
    }))

    const failedJobs = buildJson.jobs.filter(job => job.state === 'failed')
    await Promise.all(failedJobs.map(async job => {
      const res = await request(this.logUri(job.id))
      const content = this.parseLog(res)
      map.set({ id: job.id, number: job.number }, content)
    }))

    let body = ''

    map.forEach((content, { id, number }) => {
      body += `Here's the failing log from [${number}](${targetUrl}/${number}):\n\`\`\`\n${content}\n\`\`\`\n`
    })

    const number = buildJson.build.pull_request_number
    return { body, number }
  }
}

module.exports = Travis